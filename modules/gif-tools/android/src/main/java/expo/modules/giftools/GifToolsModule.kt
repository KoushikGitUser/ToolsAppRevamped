package expo.modules.giftools

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileOutputStream

class GifToolsModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("GifTools")

    // createGif(imagePaths[], outputPath, width, height, delay, quality) -> { path, size, frameCount }
    AsyncFunction("createGif") { imagePaths: List<String>, outputPath: String, width: Int, height: Int, delayMs: Int, quality: Int, promise: Promise ->
      Thread {
        try {
          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val encoder = AnimatedGifEncoder()
          val fos = FileOutputStream(outputFile)
          encoder.start(fos)
          encoder.setDelay(delayMs)
          encoder.setRepeat(0)
          encoder.setQuality(quality)
          encoder.setSize(width, height)

          val context = appContext.reactContext

          for (path in imagePaths) {
            val uri = Uri.parse(path)
            val bitmap = if (uri.scheme == "content" && context != null) {
              val inputStream = context.contentResolver.openInputStream(uri)
                ?: throw Exception("Could not open image")
              BitmapFactory.decodeStream(inputStream).also { inputStream.close() }
            } else {
              val rawPath = path.replace("file://", "")
              BitmapFactory.decodeFile(rawPath)
            } ?: throw Exception("Could not decode image: $path")

            val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
            encoder.addFrame(scaled)
            if (scaled != bitmap) scaled.recycle()
            bitmap.recycle()
          }

          encoder.finish()
          fos.close()

          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "frameCount" to imagePaths.size
          ))
        } catch (e: Exception) {
          promise.reject("ERR_GIF_CREATE", "Failed to create GIF: ${e.message}", e)
        }
      }.start()
    }

    // videoToGif(videoPath, outputPath, width, fps, quality, maxDurationSec) -> { path, size, frameCount, duration }
    AsyncFunction("videoToGif") { videoPath: String, outputPath: String, width: Int, fps: Int, quality: Int, maxDurationSec: Double, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val retriever = MediaMetadataRetriever()
          try {
            val uri = Uri.parse(videoPath)
            if (uri.scheme == "content") {
              retriever.setDataSource(context, uri)
            } else {
              val rawPath = videoPath.replace("file://", "")
              retriever.setDataSource(rawPath)
            }

            // Get video duration in ms
            val durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val durationMs = durationStr?.toLongOrNull() ?: 0L
            if (durationMs <= 0) {
              promise.reject("ERR_VIDEO", "Could not determine video duration", null)
              return@Thread
            }

            // Cap duration at maxDurationSec
            val maxDurationMs = (maxDurationSec * 1000).toLong()
            val effectiveDurationMs = minOf(durationMs, maxDurationMs)

            // Get video dimensions to calculate height maintaining aspect ratio
            val videoWidthStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            val videoHeightStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            val videoWidth = videoWidthStr?.toIntOrNull() ?: width
            val videoHeight = videoHeightStr?.toIntOrNull() ?: width
            val aspectRatio = videoHeight.toFloat() / videoWidth.toFloat()
            val gifWidth = width
            val gifHeight = (gifWidth * aspectRatio).toInt()

            // Calculate frame times
            val frameIntervalMs = 1000L / fps
            val frameTimes = mutableListOf<Long>()
            var t = 0L
            while (t < effectiveDurationMs) {
              frameTimes.add(t)
              t += frameIntervalMs
            }

            if (frameTimes.isEmpty()) {
              promise.reject("ERR_VIDEO", "Video too short to extract frames", null)
              return@Thread
            }

            // Set up GIF encoder
            val encoder = AnimatedGifEncoder()
            val fos = FileOutputStream(outputFile)
            encoder.start(fos)
            encoder.setDelay(frameIntervalMs.toInt())
            encoder.setRepeat(0)
            encoder.setQuality(quality)
            encoder.setSize(gifWidth, gifHeight)

            var frameCount = 0
            for (timeMs in frameTimes) {
              val timeUs = timeMs * 1000 // MediaMetadataRetriever uses microseconds
              val frame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
              if (frame != null) {
                val scaled = Bitmap.createScaledBitmap(frame, gifWidth, gifHeight, true)
                encoder.addFrame(scaled)
                if (scaled != frame) scaled.recycle()
                frame.recycle()
                frameCount++
              }
            }

            encoder.finish()
            fos.close()

            if (frameCount == 0) {
              outputFile.delete()
              promise.reject("ERR_VIDEO", "Could not extract any frames from video", null)
              return@Thread
            }

            promise.resolve(mapOf(
              "path" to outputFile.absolutePath,
              "size" to outputFile.length(),
              "frameCount" to frameCount,
              "duration" to (effectiveDurationMs / 1000.0)
            ))
          } finally {
            retriever.release()
          }
        } catch (e: Exception) {
          promise.reject("ERR_VIDEO_GIF", "Video to GIF failed: ${e.message}", e)
        }
      }.start()
    }
  }
}
