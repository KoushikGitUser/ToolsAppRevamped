package expo.modules.audioextractor

import android.media.MediaExtractor
import android.media.MediaMuxer
import android.media.MediaFormat
import android.media.MediaCodec
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer

private fun intToLEBytes(value: Int): ByteArray {
  return byteArrayOf(
    (value and 0xFF).toByte(),
    ((value shr 8) and 0xFF).toByte(),
    ((value shr 16) and 0xFF).toByte(),
    ((value shr 24) and 0xFF).toByte()
  )
}

private fun shortToLEBytes(value: Int): ByteArray {
  return byteArrayOf(
    (value and 0xFF).toByte(),
    ((value shr 8) and 0xFF).toByte()
  )
}

class AudioExtractorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioExtractor")

    // extractAudio(inputPath, outputPath) -> { path: String, size: Long }
    AsyncFunction("extractAudio") { inputPath: String, outputPath: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
          return@AsyncFunction
        }

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        if (outputFile.exists()) outputFile.delete()

        val extractor = MediaExtractor()

        val uri = Uri.parse(inputPath)
        if (uri.scheme == "content") {
          val fd = context.contentResolver.openFileDescriptor(uri, "r")
          if (fd == null) {
            promise.reject("ERR_OPEN_FILE", "Could not open video file", null)
            return@AsyncFunction
          }
          extractor.setDataSource(fd.fileDescriptor)
          fd.close()
        } else {
          extractor.setDataSource(inputPath)
        }

        var audioTrackIndex = -1
        var audioFormat: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
          val format = extractor.getTrackFormat(i)
          val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
          if (mime.startsWith("audio/")) {
            audioTrackIndex = i
            audioFormat = format
            break
          }
        }

        if (audioTrackIndex == -1 || audioFormat == null) {
          extractor.release()
          promise.reject("ERR_NO_AUDIO", "No audio track found in the video", null)
          return@AsyncFunction
        }

        extractor.selectTrack(audioTrackIndex)

        val muxer = MediaMuxer(
          outputFile.absolutePath,
          MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
        )

        val muxerTrackIndex = muxer.addTrack(audioFormat)
        muxer.start()

        val maxInputSize = try {
          audioFormat.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
        } catch (e: Exception) {
          1024 * 1024
        }
        val buffer = ByteBuffer.allocate(maxInputSize)
        val bufferInfo = MediaCodec.BufferInfo()

        while (true) {
          val sampleSize = extractor.readSampleData(buffer, 0)
          if (sampleSize < 0) break

          bufferInfo.offset = 0
          bufferInfo.size = sampleSize
          bufferInfo.presentationTimeUs = extractor.sampleTime
          bufferInfo.flags = extractor.sampleFlags

          muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)
          extractor.advance()
        }

        muxer.stop()
        muxer.release()
        extractor.release()

        if (outputFile.exists() && outputFile.length() > 0) {
          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length()
          ))
        } else {
          promise.reject("ERR_EXTRACTION", "Failed to extract audio - output file is empty", null)
        }
      } catch (e: Exception) {
        promise.reject("ERR_EXTRACTION", "Audio extraction failed: ${e.message}", e)
      }
    }

    // amplifyAudio(inputPath, outputPath, gain) -> { path: String, size: Long }
    // gain: 0.0 = silence, 1.0 = original, 2.0 = 2x louder, etc.
    // Decode to PCM → apply gain → write as WAV (no encoder/muxer needed)
    AsyncFunction("amplifyAudio") { inputPath: String, outputPath: String, gain: Double, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          // Force .wav extension on output
          val wavPath = outputPath.replaceAfterLast('.', "wav")
          val outputFile = File(wavPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val filePath = if (inputPath.startsWith("file://")) inputPath.removePrefix("file://") else inputPath
          val gainFloat = gain.toFloat()
          Log.d("AudioExtractor", "amplifyAudio start: gain=$gain, gainFloat=$gainFloat, input=$filePath")

          // Set up extractor
          val extractor = MediaExtractor()
          val uri = Uri.parse(inputPath)
          if (uri.scheme == "content") {
            val fd = context.contentResolver.openFileDescriptor(uri, "r")
            if (fd == null) {
              promise.reject("ERR_OPEN_FILE", "Could not open audio file", null)
              return@Thread
            }
            extractor.setDataSource(fd.fileDescriptor)
            fd.close()
          } else {
            extractor.setDataSource(filePath)
          }

          var audioTrackIndex = -1
          var inputFormat: MediaFormat? = null
          for (i in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(i)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
              audioTrackIndex = i
              inputFormat = format
              break
            }
          }

          if (audioTrackIndex == -1 || inputFormat == null) {
            extractor.release()
            promise.reject("ERR_NO_AUDIO", "No audio track found", null)
            return@Thread
          }

          extractor.selectTrack(audioTrackIndex)

          val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: "audio/mp4a-latm"
          val sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          val channelCount = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          Log.d("AudioExtractor", "Audio: mime=$mime, rate=$sampleRate, ch=$channelCount")

          // Decode all compressed audio to PCM and apply gain
          val decoder = MediaCodec.createDecoderByType(mime)
          decoder.configure(inputFormat, null, null, 0)
          decoder.start()

          // Write PCM directly to file (stream, don't buffer all in memory)
          val fos = FileOutputStream(outputFile)
          // Write placeholder WAV header (44 bytes), we'll fix it after
          fos.write(ByteArray(44))

          var totalPcmSize = 0L
          val bufferInfo = MediaCodec.BufferInfo()
          var inputDone = false
          var outputDone = false
          val TIMEOUT_US = 10000L

          while (!outputDone) {
            // Feed compressed data to decoder
            if (!inputDone) {
              val idx = decoder.dequeueInputBuffer(TIMEOUT_US)
              if (idx >= 0) {
                val buf = decoder.getInputBuffer(idx)!!
                val size = extractor.readSampleData(buf, 0)
                if (size < 0) {
                  decoder.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  inputDone = true
                } else {
                  decoder.queueInputBuffer(idx, 0, size, extractor.sampleTime, 0)
                  extractor.advance()
                }
              }
            }

            // Get decoded PCM output
            val outIdx = decoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            if (outIdx >= 0) {
              if (bufferInfo.size > 0) {
                val outBuf = decoder.getOutputBuffer(outIdx)!!
                val pcm = ByteArray(bufferInfo.size)
                outBuf.get(pcm)

                // Apply gain directly on 16-bit LE PCM bytes
                val numSamples = pcm.size / 2
                for (i in 0 until numSamples) {
                  val pos = i * 2
                  val lo = pcm[pos].toInt() and 0xFF
                  val hi = pcm[pos + 1].toInt()
                  val sample = (hi shl 8) or lo
                  var amplified = (sample * gainFloat).toInt()
                  if (amplified > 32767) amplified = 32767
                  else if (amplified < -32768) amplified = -32768
                  pcm[pos] = (amplified and 0xFF).toByte()
                  pcm[pos + 1] = ((amplified shr 8) and 0xFF).toByte()
                }

                fos.write(pcm)
                totalPcmSize += pcm.size
              }
              decoder.releaseOutputBuffer(outIdx, false)
              if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                outputDone = true
              }
            }
          }

          fos.flush()
          fos.close()
          decoder.stop()
          decoder.release()
          extractor.release()

          Log.d("AudioExtractor", "Decode done: $totalPcmSize PCM bytes")

          if (totalPcmSize == 0L) {
            outputFile.delete()
            promise.reject("ERR_AMPLIFY", "No audio data decoded", null)
            return@Thread
          }

          // Write proper WAV header
          val bitsPerSample = 16
          val byteRate = sampleRate * channelCount * bitsPerSample / 8
          val blockAlign = channelCount * bitsPerSample / 8
          val dataSize = totalPcmSize.toInt()
          val fileSize = 36 + dataSize

          val raf = RandomAccessFile(outputFile, "rw")
          raf.seek(0)
          raf.writeBytes("RIFF")
          raf.write(intToLEBytes(fileSize))
          raf.writeBytes("WAVE")
          raf.writeBytes("fmt ")
          raf.write(intToLEBytes(16))              // chunk size
          raf.write(shortToLEBytes(1))             // PCM format
          raf.write(shortToLEBytes(channelCount))
          raf.write(intToLEBytes(sampleRate))
          raf.write(intToLEBytes(byteRate))
          raf.write(shortToLEBytes(blockAlign))
          raf.write(shortToLEBytes(bitsPerSample))
          raf.writeBytes("data")
          raf.write(intToLEBytes(dataSize))
          raf.close()

          Log.d("AudioExtractor", "WAV written: ${outputFile.length()} bytes, rate=$sampleRate, ch=$channelCount")

          if (outputFile.exists() && outputFile.length() > 44) {
            promise.resolve(mapOf(
              "path" to outputFile.absolutePath,
              "size" to outputFile.length()
            ))
          } else {
            promise.reject("ERR_AMPLIFY", "Failed to amplify audio - output file is empty", null)
          }
        } catch (e: Exception) {
          Log.e("AudioExtractor", "amplifyAudio error", e)
          promise.reject("ERR_AMPLIFY", "Audio amplification failed: ${e.message}", e)
        }
      }.start()
    }

    // fadeAudio(inputPath, outputPath, gain, fadeInDuration, fadeOutDuration) -> { path, size }
    // fadeInDuration / fadeOutDuration: seconds (0 = no fade)
    AsyncFunction("fadeAudio") { inputPath: String, outputPath: String, gain: Double, fadeInDuration: Double, fadeOutDuration: Double, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          val wavPath = outputPath.replaceAfterLast('.', "wav")
          val outputFile = File(wavPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val filePath = if (inputPath.startsWith("file://")) inputPath.removePrefix("file://") else inputPath
          val gainFloat = gain.toFloat()

          val extractor = MediaExtractor()
          val uri = android.net.Uri.parse(inputPath)
          if (uri.scheme == "content") {
            val fd = context.contentResolver.openFileDescriptor(uri, "r")
            if (fd == null) {
              promise.reject("ERR_OPEN_FILE", "Could not open audio file", null)
              return@Thread
            }
            extractor.setDataSource(fd.fileDescriptor)
            fd.close()
          } else {
            extractor.setDataSource(filePath)
          }

          var audioTrackIndex = -1
          var inputFormat: MediaFormat? = null
          for (i in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(i)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
              audioTrackIndex = i
              inputFormat = format
              break
            }
          }

          if (audioTrackIndex == -1 || inputFormat == null) {
            extractor.release()
            promise.reject("ERR_NO_AUDIO", "No audio track found", null)
            return@Thread
          }

          extractor.selectTrack(audioTrackIndex)

          val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: "audio/mp4a-latm"
          val sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          val channelCount = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

          val decoder = MediaCodec.createDecoderByType(mime)
          decoder.configure(inputFormat, null, null, 0)
          decoder.start()

          // Buffer all PCM in memory so we can apply fade (needs total frame count)
          val pcmStream = java.io.ByteArrayOutputStream()
          val bufferInfo = MediaCodec.BufferInfo()
          var inputDone = false
          var outputDone = false
          val TIMEOUT_US = 10000L

          while (!outputDone) {
            if (!inputDone) {
              val idx = decoder.dequeueInputBuffer(TIMEOUT_US)
              if (idx >= 0) {
                val buf = decoder.getInputBuffer(idx)!!
                val size = extractor.readSampleData(buf, 0)
                if (size < 0) {
                  decoder.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  inputDone = true
                } else {
                  decoder.queueInputBuffer(idx, 0, size, extractor.sampleTime, 0)
                  extractor.advance()
                }
              }
            }

            val outIdx = decoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            if (outIdx >= 0) {
              if (bufferInfo.size > 0) {
                val outBuf = decoder.getOutputBuffer(outIdx)!!
                val chunk = ByteArray(bufferInfo.size)
                outBuf.get(chunk)
                pcmStream.write(chunk)
              }
              decoder.releaseOutputBuffer(outIdx, false)
              if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                outputDone = true
              }
            }
          }

          decoder.stop()
          decoder.release()
          extractor.release()

          val pcm = pcmStream.toByteArray()
          if (pcm.isEmpty()) {
            promise.reject("ERR_FADE", "No audio data decoded", null)
            return@Thread
          }

          val bytesPerFrame = channelCount * 2 // 16-bit samples
          val totalFrames = pcm.size / bytesPerFrame
          val fadeInFrames = (fadeInDuration * sampleRate).toInt().coerceAtMost(totalFrames)
          val fadeOutFrames = (fadeOutDuration * sampleRate).toInt().coerceAtMost(totalFrames)
          val fadeOutStart = totalFrames - fadeOutFrames

          // Apply gain + fade ramps on 16-bit LE PCM
          for (frame in 0 until totalFrames) {
            var multiplier = gainFloat
            if (fadeInFrames > 0 && frame < fadeInFrames) {
              multiplier *= frame.toFloat() / fadeInFrames.toFloat()
            }
            if (fadeOutFrames > 0 && frame >= fadeOutStart) {
              val pos = frame - fadeOutStart
              multiplier *= 1f - (pos.toFloat() / fadeOutFrames.toFloat())
            }
            for (ch in 0 until channelCount) {
              val bytePos = frame * bytesPerFrame + ch * 2
              val lo = pcm[bytePos].toInt() and 0xFF
              val hi = pcm[bytePos + 1].toInt()
              val sample = (hi shl 8) or lo
              var out = (sample * multiplier).toInt()
              if (out > 32767) out = 32767
              else if (out < -32768) out = -32768
              pcm[bytePos] = (out and 0xFF).toByte()
              pcm[bytePos + 1] = ((out shr 8) and 0xFF).toByte()
            }
          }

          // Write WAV file
          val dataSize = pcm.size
          val fileSize = 36 + dataSize
          val bitsPerSample = 16
          val byteRate = sampleRate * channelCount * bitsPerSample / 8
          val blockAlign = channelCount * bitsPerSample / 8

          val fos = FileOutputStream(outputFile)
          fos.write("RIFF".toByteArray(Charsets.US_ASCII))
          fos.write(intToLEBytes(fileSize))
          fos.write("WAVE".toByteArray(Charsets.US_ASCII))
          fos.write("fmt ".toByteArray(Charsets.US_ASCII))
          fos.write(intToLEBytes(16))
          fos.write(shortToLEBytes(1))
          fos.write(shortToLEBytes(channelCount))
          fos.write(intToLEBytes(sampleRate))
          fos.write(intToLEBytes(byteRate))
          fos.write(shortToLEBytes(blockAlign))
          fos.write(shortToLEBytes(bitsPerSample))
          fos.write("data".toByteArray(Charsets.US_ASCII))
          fos.write(intToLEBytes(dataSize))
          fos.write(pcm)
          fos.flush()
          fos.close()

          if (outputFile.exists() && outputFile.length() > 44) {
            promise.resolve(mapOf(
              "path" to outputFile.absolutePath,
              "size" to outputFile.length()
            ))
          } else {
            promise.reject("ERR_FADE", "Failed to apply fade - output file is empty", null)
          }
        } catch (e: Exception) {
          Log.e("AudioExtractor", "fadeAudio error", e)
          promise.reject("ERR_FADE", "Audio fade failed: ${e.message}", e)
        }
      }.start()
    }
  }
}
