package expo.modules.audiomerger

import android.media.*
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AudioMergerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioMerger")

    Events("onProgress")

    // Get audio file info (duration, sample rate, channels, mime)
    AsyncFunction("getAudioInfo") { uriString: String, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          val uri = Uri.parse(uriString)
          val extractor = MediaExtractor()

          if (uri.scheme == "content") {
            val fd = context.contentResolver.openFileDescriptor(uri, "r")
            if (fd == null) {
              promise.reject("ERR_OPEN_FILE", "Could not open audio file", null)
              return@Thread
            }
            extractor.setDataSource(fd.fileDescriptor)
            fd.close()
          } else {
            val path = uriString.replace("file://", "")
            extractor.setDataSource(path)
          }

          var audioTrackIndex = -1
          for (i in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(i)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
            if (mime.startsWith("audio/")) {
              audioTrackIndex = i
              break
            }
          }

          if (audioTrackIndex == -1) {
            extractor.release()
            promise.reject("ERR_NO_AUDIO", "No audio track found in file", null)
            return@Thread
          }

          val format = extractor.getTrackFormat(audioTrackIndex)
          val mime = format.getString(MediaFormat.KEY_MIME) ?: "unknown"
          val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          val duration = if (format.containsKey(MediaFormat.KEY_DURATION)) {
            format.getLong(MediaFormat.KEY_DURATION) / 1000
          } else 0L

          var name = "Unknown"
          if (uri.scheme == "content") {
            val cursor = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
            cursor?.use {
              if (it.moveToFirst()) {
                name = it.getString(0) ?: "Unknown"
              }
            }
          } else {
            name = File(uriString.replace("file://", "")).name
          }

          extractor.release()

          promise.resolve(mapOf(
            "uri" to uriString,
            "name" to name,
            "duration" to duration,
            "sampleRate" to sampleRate,
            "channels" to channels,
            "mimeType" to mime
          ))
        } catch (e: Exception) {
          promise.reject("ERR_AUDIO_INFO", "Failed to get audio info: ${e.message}", e)
        }
      }.start()
    }

    // Merge multiple audio files into one — streaming approach (low memory)
    AsyncFunction("mergeAudios") { uris: List<String>, outputName: String, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          if (uris.size < 2) {
            promise.reject("ERR_MIN_FILES", "At least 2 audio files are required", null)
            return@Thread
          }

          val targetSampleRate = 44100
          val targetChannels = 2
          val totalFiles = uris.size

          // Step 1: Decode each audio file to a temp raw PCM file on disk
          val tempPcmFile = File(context.cacheDir, "merge_temp_${System.currentTimeMillis()}.raw")
          val pcmOutputStream = FileOutputStream(tempPcmFile)
          var totalBytesWritten = 0L

          for ((index, uriString) in uris.withIndex()) {
            sendEvent("onProgress", mapOf("progress" to ((index.toFloat() / totalFiles) * 70).toInt()))

            val success = decodeAudioToStream(context, uriString, targetSampleRate, targetChannels, pcmOutputStream)
            if (!success) {
              pcmOutputStream.close()
              tempPcmFile.delete()
              promise.reject("ERR_DECODE", "Failed to decode audio file ${index + 1}", null)
              return@Thread
            }
          }

          pcmOutputStream.flush()
          pcmOutputStream.close()
          totalBytesWritten = tempPcmFile.length()

          sendEvent("onProgress", mapOf("progress" to 75))

          // Step 2: Stream the temp PCM file into the AAC encoder
          val outputFile = File(context.cacheDir, "$outputName.m4a")
          if (outputFile.exists()) outputFile.delete()

          encodePcmStreamToAac(tempPcmFile, targetSampleRate, targetChannels, outputFile)

          sendEvent("onProgress", mapOf("progress" to 95))

          // Clean up temp file
          tempPcmFile.delete()

          val totalSamples = totalBytesWritten / 2 // 16-bit = 2 bytes per sample
          val durationMs = (totalSamples / (targetSampleRate * targetChannels)) * 1000

          sendEvent("onProgress", mapOf("progress" to 100))

          promise.resolve(mapOf(
            "uri" to "file://" + outputFile.absolutePath,
            "duration" to durationMs,
            "size" to outputFile.length()
          ))
        } catch (e: Exception) {
          promise.reject("ERR_MERGE", "Failed to merge audio: ${e.message}", e)
        }
      }.start()
    }
  }

  /**
   * Decode an audio file and stream PCM chunks directly to an OutputStream.
   * Handles channel conversion and resampling in small chunks to avoid OOM.
   */
  private fun decodeAudioToStream(
    context: android.content.Context,
    uriString: String,
    targetSampleRate: Int,
    targetChannels: Int,
    output: FileOutputStream
  ): Boolean {
    val uri = Uri.parse(uriString)
    val extractor = MediaExtractor()

    try {
      if (uri.scheme == "content") {
        val fd = context.contentResolver.openFileDescriptor(uri, "r") ?: return false
        extractor.setDataSource(fd.fileDescriptor)
        fd.close()
      } else {
        val path = uriString.replace("file://", "")
        extractor.setDataSource(path)
      }

      var audioTrackIndex = -1
      var audioFormat: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
        if (mime.startsWith("audio/")) {
          audioTrackIndex = i
          audioFormat = format
          break
        }
      }

      if (audioTrackIndex == -1 || audioFormat == null) {
        extractor.release()
        return false
      }

      extractor.selectTrack(audioTrackIndex)

      val mime = audioFormat.getString(MediaFormat.KEY_MIME) ?: return false
      val sourceSampleRate = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val sourceChannels = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val needsChannelConvert = sourceChannels != targetChannels
      val needsResample = sourceSampleRate != targetSampleRate

      val decoder = MediaCodec.createDecoderByType(mime)
      decoder.configure(audioFormat, null, null, 0)
      decoder.start()

      val bufferInfo = MediaCodec.BufferInfo()
      var isEos = false
      var inputDone = false
      val timeoutUs = 10000L

      while (!isEos) {
        if (!inputDone) {
          val inputIndex = decoder.dequeueInputBuffer(timeoutUs)
          if (inputIndex >= 0) {
            val inputBuffer = decoder.getInputBuffer(inputIndex) ?: continue
            val sampleSize = extractor.readSampleData(inputBuffer, 0)
            if (sampleSize < 0) {
              decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              val pts = extractor.sampleTime
              decoder.queueInputBuffer(inputIndex, 0, sampleSize, pts, 0)
              extractor.advance()
            }
          }
        }

        val outputIndex = decoder.dequeueOutputBuffer(bufferInfo, timeoutUs)
        if (outputIndex >= 0) {
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
            isEos = true
          }

          val outputBuffer = decoder.getOutputBuffer(outputIndex)
          if (outputBuffer != null && bufferInfo.size > 0) {
            outputBuffer.position(bufferInfo.offset)
            outputBuffer.limit(bufferInfo.offset + bufferInfo.size)

            // Read decoded PCM chunk as shorts
            val shortBuf = outputBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
            var chunk = ShortArray(shortBuf.remaining())
            shortBuf.get(chunk)

            // Convert channels if needed
            if (needsChannelConvert) {
              chunk = convertChannels(chunk, sourceChannels, targetChannels)
            }

            // Resample if needed
            if (needsResample) {
              chunk = resample(chunk, sourceSampleRate, targetSampleRate, targetChannels)
            }

            // Write chunk as bytes to output stream
            val byteBuffer = ByteBuffer.allocate(chunk.size * 2).order(ByteOrder.LITTLE_ENDIAN)
            byteBuffer.asShortBuffer().put(chunk)
            output.write(byteBuffer.array())
          }

          decoder.releaseOutputBuffer(outputIndex, false)
        }
      }

      decoder.stop()
      decoder.release()
      extractor.release()
      return true
    } catch (e: Exception) {
      extractor.release()
      return false
    }
  }

  private fun convertChannels(input: ShortArray, fromChannels: Int, toChannels: Int): ShortArray {
    if (fromChannels == toChannels) return input

    if (fromChannels == 1 && toChannels == 2) {
      val output = ShortArray(input.size * 2)
      for (i in input.indices) {
        output[i * 2] = input[i]
        output[i * 2 + 1] = input[i]
      }
      return output
    }

    if (fromChannels == 2 && toChannels == 1) {
      val output = ShortArray(input.size / 2)
      for (i in output.indices) {
        val l = input[i * 2].toInt()
        val r = input[i * 2 + 1].toInt()
        output[i] = ((l + r) / 2).toShort()
      }
      return output
    }

    return input
  }

  private fun resample(input: ShortArray, fromRate: Int, toRate: Int, channels: Int): ShortArray {
    if (fromRate == toRate) return input

    val ratio = toRate.toDouble() / fromRate.toDouble()
    val framesIn = input.size / channels
    val framesOut = (framesIn * ratio).toInt()
    if (framesOut == 0) return ShortArray(0)
    val output = ShortArray(framesOut * channels)

    for (i in 0 until framesOut) {
      val srcPos = i.toDouble() / ratio
      val srcIndex = srcPos.toInt()
      val frac = srcPos - srcIndex

      for (ch in 0 until channels) {
        val idx1 = (srcIndex * channels + ch).coerceIn(0, input.size - 1)
        val idx2 = ((srcIndex + 1) * channels + ch).coerceIn(0, input.size - 1)
        val sample = (input[idx1] * (1 - frac) + input[idx2] * frac).toInt().coerceIn(-32768, 32767)
        output[i * channels + ch] = sample.toShort()
      }
    }

    return output
  }

  /**
   * Stream raw PCM from a file into the AAC encoder + muxer.
   * Reads in small chunks to keep memory usage low.
   */
  private fun encodePcmStreamToAac(pcmFile: File, sampleRate: Int, channels: Int, outputFile: File) {
    val bitRate = 128000
    val mime = MediaFormat.MIMETYPE_AUDIO_AAC

    val format = MediaFormat.createAudioFormat(mime, sampleRate, channels)
    format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
    format.setInteger(MediaFormat.KEY_BIT_RATE, bitRate)

    val encoder = MediaCodec.createEncoderByType(mime)
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    encoder.start()

    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerTrackIndex = -1
    var muxerStarted = false

    val pcmInput = FileInputStream(pcmFile)
    val readBuffer = ByteArray(8192) // Read 8KB at a time
    val bufferInfo = MediaCodec.BufferInfo()
    val timeoutUs = 10000L
    var inputDone = false
    var totalBytesRead = 0L
    val totalBytes = pcmFile.length()
    var presentationTimeUs = 0L

    // Leftover bytes from previous read that didn't fill a complete sample
    var leftover = ByteArray(0)

    while (true) {
      // Feed input to encoder
      if (!inputDone) {
        val inputIndex = encoder.dequeueInputBuffer(timeoutUs)
        if (inputIndex >= 0) {
          val inputBuffer = encoder.getInputBuffer(inputIndex) ?: continue
          inputBuffer.clear()
          val capacity = inputBuffer.capacity()

          // Fill the input buffer from the file
          var bytesWritten = 0

          // First, write any leftover from previous iteration
          if (leftover.isNotEmpty()) {
            val toCopy = minOf(leftover.size, capacity)
            inputBuffer.put(leftover, 0, toCopy)
            bytesWritten += toCopy
            leftover = if (toCopy < leftover.size) leftover.copyOfRange(toCopy, leftover.size) else ByteArray(0)
          }

          // Then read from file
          while (bytesWritten < capacity) {
            val toRead = minOf(readBuffer.size, capacity - bytesWritten)
            val read = pcmInput.read(readBuffer, 0, toRead)
            if (read == -1) break
            totalBytesRead += read
            inputBuffer.put(readBuffer, 0, read)
            bytesWritten += read
          }

          if (bytesWritten == 0) {
            encoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            // Ensure we write an even number of bytes (16-bit samples)
            if (bytesWritten % 2 != 0) {
              bytesWritten -= 1
              // Save the odd byte as leftover
              inputBuffer.position(bytesWritten)
              val oddByte = inputBuffer.get()
              leftover = byteArrayOf(oddByte)
            }
            presentationTimeUs = (totalBytesRead / 2) * 1_000_000L / (sampleRate * channels)
            encoder.queueInputBuffer(inputIndex, 0, bytesWritten, presentationTimeUs, 0)
          }
        }
      }

      // Read encoder output
      val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, timeoutUs)
      if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        val newFormat = encoder.outputFormat
        muxerTrackIndex = muxer.addTrack(newFormat)
        muxer.start()
        muxerStarted = true
      } else if (outputIndex >= 0) {
        val outputBuffer = encoder.getOutputBuffer(outputIndex)
        if (outputBuffer != null && bufferInfo.size > 0 && muxerStarted) {
          outputBuffer.position(bufferInfo.offset)
          outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
          muxer.writeSampleData(muxerTrackIndex, outputBuffer, bufferInfo)
        }

        encoder.releaseOutputBuffer(outputIndex, false)

        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
          break
        }
      }
    }

    pcmInput.close()
    encoder.stop()
    encoder.release()
    if (muxerStarted) {
      muxer.stop()
      muxer.release()
    }
  }
}
