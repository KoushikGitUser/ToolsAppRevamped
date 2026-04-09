package expo.modules.videoconverter

import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaCodec
import android.media.MediaCodecInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

class VideoConverterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoConverter")

    AsyncFunction("convertToMp4") { inputPath: String, outputPath: String ->
      val extractor = MediaExtractor()
      extractor.setDataSource(inputPath)

      val trackCount = extractor.trackCount
      val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

      val trackMap = mutableMapOf<Int, Int>() // extractor track -> muxer track
      var needsVideoReencode = false
      var needsAudioReencode = false
      var videoTrackIndex = -1
      var audioTrackIndex = -1

      // Check all tracks and add compatible ones directly
      for (i in 0 until trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue

        if (mime.startsWith("video/")) {
          videoTrackIndex = i
          // H.264 and H.265 are MP4-compatible, others need re-encoding
          if (mime == "video/avc" || mime == "video/hevc") {
            extractor.selectTrack(i)
            val muxerTrack = muxer.addTrack(format)
            trackMap[i] = muxerTrack
          } else {
            needsVideoReencode = true
          }
        } else if (mime.startsWith("audio/")) {
          audioTrackIndex = i
          // AAC and MP3 are MP4-compatible
          if (mime == "audio/mp4a-latm" || mime == "audio/mpeg") {
            extractor.selectTrack(i)
            val muxerTrack = muxer.addTrack(format)
            trackMap[i] = muxerTrack
          } else {
            needsAudioReencode = true
          }
        }
      }

      if (needsVideoReencode) {
        extractor.release()
        muxer.release()
        throw Exception("Video codec is not MP4-compatible and requires re-encoding. This format is not supported yet.")
      }

      if (trackMap.isEmpty()) {
        extractor.release()
        muxer.release()
        throw Exception("No compatible tracks found in the input file.")
      }

      // If audio needs re-encoding but video is fine, handle audio re-encode
      if (needsAudioReencode && audioTrackIndex >= 0) {
        val audioFormat = extractor.getTrackFormat(audioTrackIndex)
        val audioMime = audioFormat.getString(MediaFormat.KEY_MIME) ?: ""
        val sampleRate = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val channelCount = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

        // Set up audio decoder
        val decoder = MediaCodec.createDecoderByType(audioMime)
        decoder.configure(audioFormat, null, null, 0)
        decoder.start()

        // Set up AAC encoder
        val encFormat = MediaFormat.createAudioFormat("audio/mp4a-latm", sampleRate, channelCount)
        encFormat.setInteger(MediaFormat.KEY_BIT_RATE, 128000)
        encFormat.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        val encoder = MediaCodec.createEncoderByType("audio/mp4a-latm")
        encoder.configure(encFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        encoder.start()

        extractor.selectTrack(audioTrackIndex)

        var audioMuxerTrack = -1
        var decInputDone = false
        var decOutputDone = false
        var encInputDone = false
        var encOutputDone = false
        val bufInfo = MediaCodec.BufferInfo()
        val pcmQueue = ArrayDeque<Pair<ByteArray, Long>>()

        // Don't start muxer until audio track is added
        var muxerStarted = false

        while (!encOutputDone) {
          // Feed decoder
          if (!decInputDone) {
            val idx = decoder.dequeueInputBuffer(10000)
            if (idx >= 0) {
              val buf = decoder.getInputBuffer(idx)!!
              val size = extractor.readSampleData(buf, 0)
              if (size < 0) {
                decoder.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                decInputDone = true
              } else {
                decoder.queueInputBuffer(idx, 0, size, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }

          // Drain decoder -> PCM queue
          if (!decOutputDone) {
            val idx = decoder.dequeueOutputBuffer(bufInfo, 10000)
            if (idx >= 0) {
              if (bufInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                decOutputDone = true
              } else {
                val buf = decoder.getOutputBuffer(idx)!!
                val data = ByteArray(bufInfo.size)
                buf.get(data)
                pcmQueue.addLast(Pair(data, bufInfo.presentationTimeUs))
              }
              decoder.releaseOutputBuffer(idx, false)
            }
          }

          // Feed encoder
          if (!encInputDone) {
            val idx = encoder.dequeueInputBuffer(10000)
            if (idx >= 0) {
              val buf = encoder.getInputBuffer(idx)!!
              buf.clear()
              if (pcmQueue.isEmpty() && decOutputDone) {
                encoder.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                encInputDone = true
              } else if (pcmQueue.isNotEmpty()) {
                val (data, pts) = pcmQueue.removeFirst()
                val size = minOf(data.size, buf.capacity())
                buf.put(data, 0, size)
                encoder.queueInputBuffer(idx, 0, size, pts, 0)
              }
            }
          }

          // Drain encoder -> muxer
          val idx = encoder.dequeueOutputBuffer(bufInfo, 10000)
          if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            audioMuxerTrack = muxer.addTrack(encoder.outputFormat)
            if (!muxerStarted) {
              muxer.start()
              muxerStarted = true
            }
          } else if (idx >= 0) {
            if (bufInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
              encOutputDone = true
            } else if (bufInfo.size > 0 && audioMuxerTrack >= 0) {
              val buf = encoder.getOutputBuffer(idx)!!
              buf.position(bufInfo.offset)
              buf.limit(bufInfo.offset + bufInfo.size)
              muxer.writeSampleData(audioMuxerTrack, buf, bufInfo)
            }
            encoder.releaseOutputBuffer(idx, false)
          }
        }

        decoder.stop()
        decoder.release()
        encoder.stop()
        encoder.release()

        // Now write video track with timestamp normalization
        if (trackMap.isNotEmpty()) {
          extractor.release()
          val ext2 = MediaExtractor()
          ext2.setDataSource(inputPath)

          for ((srcTrack, dstTrack) in trackMap) {
            ext2.selectTrack(srcTrack)
          }

          val buffer = ByteBuffer.allocate(1024 * 1024)
          val info = MediaCodec.BufferInfo()

          // Per-track timestamp tracking
          val firstPtsMap = mutableMapOf<Int, Long>()
          val lastPtsMap = mutableMapOf<Int, Long>()

          while (true) {
            val size = ext2.readSampleData(buffer, 0)
            if (size < 0) break

            val srcTrack = ext2.sampleTrackIndex
            if (trackMap.containsKey(srcTrack)) {
              var pts = ext2.sampleTime

              // Normalize PTS per track
              if (!firstPtsMap.containsKey(srcTrack)) {
                firstPtsMap[srcTrack] = pts
              }
              pts -= firstPtsMap[srcTrack]!!

              // Ensure monotonically increasing
              val last = lastPtsMap[srcTrack] ?: -1L
              if (pts <= last) {
                pts = last + 1
              }
              lastPtsMap[srcTrack] = pts

              info.offset = 0
              info.size = size
              info.presentationTimeUs = pts
              info.flags = ext2.sampleFlags
              muxer.writeSampleData(trackMap[srcTrack]!!, buffer, info)
            }
            ext2.advance()
          }
          ext2.release()
        }

        muxer.stop()
        muxer.release()
      } else {
        // Simple remux — all tracks are compatible
        // Remux each track separately to fix timestamps and avoid interleaving issues
        muxer.start()

        val buffer = ByteBuffer.allocate(1024 * 1024)
        val bufferInfo = MediaCodec.BufferInfo()

        for ((srcTrack, dstTrack) in trackMap) {
          // Reset extractor for each track
          for (i in 0 until trackCount) {
            extractor.unselectTrack(i)
          }
          extractor.selectTrack(srcTrack)
          extractor.seekTo(0, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

          var firstPts = -1L
          var lastPts = -1L

          while (true) {
            val sampleSize = extractor.readSampleData(buffer, 0)
            if (sampleSize < 0) break

            if (extractor.sampleTrackIndex != srcTrack) {
              extractor.advance()
              continue
            }

            var pts = extractor.sampleTime

            // Normalize: subtract first sample PTS so track starts at 0
            if (firstPts < 0) firstPts = pts
            pts -= firstPts

            // Ensure monotonically increasing timestamps
            if (pts <= lastPts) {
              pts = lastPts + 1
            }
            lastPts = pts

            bufferInfo.offset = 0
            bufferInfo.size = sampleSize
            bufferInfo.presentationTimeUs = pts
            bufferInfo.flags = extractor.sampleFlags

            muxer.writeSampleData(dstTrack, buffer, bufferInfo)
            extractor.advance()
          }
        }

        extractor.release()
        muxer.stop()
        muxer.release()
      }

      val outputFile = File(outputPath)
      mapOf(
        "path" to outputPath,
        "size" to outputFile.length()
      )
    }
  }
}
