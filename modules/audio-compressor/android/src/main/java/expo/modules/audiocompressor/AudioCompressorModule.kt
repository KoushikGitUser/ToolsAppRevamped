package expo.modules.audiocompressor

import android.media.MediaExtractor
import android.media.MediaMuxer
import android.media.MediaFormat
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.nio.ByteBuffer
import java.util.LinkedList

class AudioCompressorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioCompressor")

    AsyncFunction("compressAudio") { inputPath: String, outputPath: String, targetBitrate: Int, promise: Promise ->
      Thread {
        var extractor: MediaExtractor? = null
        var decoder: MediaCodec? = null
        var encoder: MediaCodec? = null
        var muxer: MediaMuxer? = null
        var muxerStarted = false

        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          val m4aPath = outputPath.replaceAfterLast('.', "m4a")
          val outputFile = File(m4aPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val filePath = if (inputPath.startsWith("file://")) inputPath.removePrefix("file://") else inputPath
          Log.d("AudioCompressor", "Start: bitrate=$targetBitrate, input=$filePath")

          // ── 1. Set up extractor ──
          extractor = MediaExtractor()
          val uri = Uri.parse(inputPath)
          if (uri.scheme == "content") {
            val fd = context.contentResolver.openFileDescriptor(uri, "r")
            if (fd == null) {
              promise.reject("ERR_OPEN_FILE", "Could not open audio file", null)
              return@Thread
            }
            extractor!!.setDataSource(fd.fileDescriptor)
            fd.close()
          } else {
            extractor!!.setDataSource(filePath)
          }

          var audioTrackIndex = -1
          var inputFormat: MediaFormat? = null
          for (i in 0 until extractor!!.trackCount) {
            val format = extractor!!.getTrackFormat(i)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
              audioTrackIndex = i
              inputFormat = format
              break
            }
          }

          if (audioTrackIndex == -1 || inputFormat == null) {
            promise.reject("ERR_NO_AUDIO", "No audio track found in the file", null)
            return@Thread
          }

          extractor!!.selectTrack(audioTrackIndex)

          val inputMime = inputFormat.getString(MediaFormat.KEY_MIME) ?: "audio/mp4a-latm"
          val sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          val channelCount = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          val durationUs = try { inputFormat.getLong(MediaFormat.KEY_DURATION) } catch (e: Exception) { 0L }

          Log.d("AudioCompressor", "Input: mime=$inputMime, rate=$sampleRate, ch=$channelCount")

          val clampedBitrate = targetBitrate.coerceIn(32000, 320000)

          // ── 2. Set up decoder ──
          decoder = MediaCodec.createDecoderByType(inputMime)
          decoder!!.configure(inputFormat, null, null, 0)
          decoder!!.start()

          // ── 3. Set up AAC encoder ──
          val encoderMime = "audio/mp4a-latm"
          val encoderFormat = MediaFormat.createAudioFormat(encoderMime, sampleRate, channelCount)
          encoderFormat.setInteger(MediaFormat.KEY_BIT_RATE, clampedBitrate)
          encoderFormat.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
          encoderFormat.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)

          encoder = MediaCodec.createEncoderByType(encoderMime)
          encoder!!.configure(encoderFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
          encoder!!.start()

          // ── 4. Set up muxer ──
          muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
          var muxerTrackIndex = -1

          // ── 5. Streaming pipeline: decode → queue → encode → mux ──
          // Small PCM chunk queue bridges decoder output to encoder input
          val pcmQueue = LinkedList<ByteArray>()
          var pcmQueueOffset = 0

          val TIMEOUT_US = 10000L
          val bytesPerFrame = channelCount * 2
          val usPerSample = 1_000_000.0 / sampleRate

          var decInputDone = false
          var decOutputDone = false
          var encInputDone = false
          var encOutputDone = false
          var presentationTimeUs = 0L
          var totalPcmBytes = 0L

          val decBufferInfo = MediaCodec.BufferInfo()
          val encBufferInfo = MediaCodec.BufferInfo()

          while (!encOutputDone) {
            // ── Step A: Feed compressed data to decoder ──
            if (!decInputDone) {
              val idx = decoder!!.dequeueInputBuffer(TIMEOUT_US)
              if (idx >= 0) {
                val buf = decoder!!.getInputBuffer(idx)!!
                val size = extractor!!.readSampleData(buf, 0)
                if (size < 0) {
                  decoder!!.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  decInputDone = true
                } else {
                  decoder!!.queueInputBuffer(idx, 0, size, extractor!!.sampleTime, 0)
                  extractor!!.advance()
                }
              }
            }

            // ── Step B: Pull decoded PCM from decoder into queue ──
            if (!decOutputDone) {
              val outIdx = decoder!!.dequeueOutputBuffer(decBufferInfo, TIMEOUT_US)
              if (outIdx >= 0) {
                if (decBufferInfo.size > 0) {
                  val outBuf = decoder!!.getOutputBuffer(outIdx)!!
                  val chunk = ByteArray(decBufferInfo.size)
                  outBuf.get(chunk)
                  pcmQueue.add(chunk)
                  totalPcmBytes += chunk.size
                }
                decoder!!.releaseOutputBuffer(outIdx, false)
                if (decBufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                  decOutputDone = true
                }
              }
            }

            // ── Step C: Feed PCM from queue to encoder ──
            // Only dequeue encoder input buffer when we have data or are done
            if (!encInputDone && (pcmQueue.isNotEmpty() || decOutputDone)) {
              val idx = encoder!!.dequeueInputBuffer(TIMEOUT_US)
              if (idx >= 0) {
                if (pcmQueue.isEmpty() && decOutputDone) {
                  // No more PCM data, signal end of stream
                  encoder!!.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  encInputDone = true
                } else {
                  val buf = encoder!!.getInputBuffer(idx)!!
                  val capacity = buf.capacity()
                  buf.clear()

                  // Fill encoder buffer from PCM queue
                  var filled = 0
                  while (pcmQueue.isNotEmpty() && filled < capacity) {
                    val front = pcmQueue.peek()!!
                    val available = front.size - pcmQueueOffset
                    val toCopy = minOf(available, capacity - filled)
                    buf.put(front, pcmQueueOffset, toCopy)
                    filled += toCopy
                    pcmQueueOffset += toCopy
                    if (pcmQueueOffset >= front.size) {
                      pcmQueue.poll()
                      pcmQueueOffset = 0
                    }
                  }

                  val samplesInChunk = filled / bytesPerFrame
                  encoder!!.queueInputBuffer(idx, 0, filled, presentationTimeUs, 0)
                  presentationTimeUs += (samplesInChunk * usPerSample).toLong()
                }
              }
            }

            // ── Step D: Pull encoded data from encoder and write to muxer ──
            val outIdx = encoder!!.dequeueOutputBuffer(encBufferInfo, TIMEOUT_US)
            when {
              outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                if (!muxerStarted) {
                  muxerTrackIndex = muxer!!.addTrack(encoder!!.outputFormat)
                  muxer!!.start()
                  muxerStarted = true
                }
              }
              outIdx >= 0 -> {
                val outBuf = encoder!!.getOutputBuffer(outIdx)!!
                if (encBufferInfo.size > 0 && muxerStarted) {
                  outBuf.position(encBufferInfo.offset)
                  outBuf.limit(encBufferInfo.offset + encBufferInfo.size)
                  muxer!!.writeSampleData(muxerTrackIndex, outBuf, encBufferInfo)
                }
                encoder!!.releaseOutputBuffer(outIdx, false)
                if (encBufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                  encOutputDone = true
                }
              }
            }
          }

          // ── 6. Clean up ──
          decoder!!.stop()
          decoder!!.release()
          decoder = null

          encoder!!.stop()
          encoder!!.release()
          encoder = null

          extractor!!.release()
          extractor = null

          if (muxerStarted) {
            muxer!!.stop()
            muxer!!.release()
            muxer = null
          }

          val actualDurationSec = if (durationUs > 0) durationUs / 1_000_000.0 else {
            totalPcmBytes.toDouble() / (sampleRate * channelCount * 2)
          }

          Log.d("AudioCompressor", "Done: ${outputFile.length()} bytes, duration=${actualDurationSec}s, bitrate=$clampedBitrate")

          if (outputFile.exists() && outputFile.length() > 100) {
            promise.resolve(mapOf(
              "path" to outputFile.absolutePath,
              "size" to outputFile.length(),
              "bitrate" to clampedBitrate,
              "duration" to actualDurationSec
            ))
          } else {
            outputFile.delete()
            promise.reject("ERR_COMPRESS", "Compression failed - output file is empty or corrupt", null)
          }
        } catch (e: Exception) {
          Log.e("AudioCompressor", "compressAudio error", e)
          // Clean up on error
          try { decoder?.stop(); decoder?.release() } catch (_: Exception) {}
          try { encoder?.stop(); encoder?.release() } catch (_: Exception) {}
          try { extractor?.release() } catch (_: Exception) {}
          try { if (muxerStarted) { muxer?.stop(); muxer?.release() } } catch (_: Exception) {}
          promise.reject("ERR_COMPRESS", "Audio compression failed: ${e.message}", e)
        }
      }.start()
    }
  }
}
