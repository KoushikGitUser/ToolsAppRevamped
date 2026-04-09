package expo.modules.bgremover

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileOutputStream
import java.nio.FloatBuffer

class BgRemoverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BgRemover")

    AsyncFunction("removeBackground") { inputPath: String, outputPath: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.reject("ERR_CONTEXT", "Context not available", null)
          return@AsyncFunction
        }

        // Load bitmap
        val bitmap: Bitmap
        val uri = Uri.parse(inputPath)
        if (uri.scheme == "content") {
          val stream = context.contentResolver.openInputStream(uri)
            ?: throw Exception("Could not open image")
          bitmap = BitmapFactory.decodeStream(stream)
          stream.close()
        } else {
          val cleanPath = inputPath.removePrefix("file://")
          bitmap = BitmapFactory.decodeFile(cleanPath)
            ?: throw Exception("Could not decode image")
        }

        // Create InputImage
        val inputImage = InputImage.fromBitmap(bitmap, 0)

        // Configure segmenter
        val options = SubjectSegmenterOptions.Builder()
          .enableForegroundConfidenceMask()
          .build()

        val segmenter = SubjectSegmentation.getClient(options)

        segmenter.process(inputImage)
          .addOnSuccessListener { result ->
            try {
              val mask: FloatBuffer = result.foregroundConfidenceMask
                ?: run {
                  promise.reject("ERR_MASK", "No confidence mask returned", null)
                  return@addOnSuccessListener
                }

              val width = bitmap.width
              val height = bitmap.height

              // Create output bitmap with transparency
              val outputBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

              mask.rewind()
              for (y in 0 until height) {
                for (x in 0 until width) {
                  val confidence = mask.get()
                  val pixel = bitmap.getPixel(x, y)

                  if (confidence > 0.5f) {
                    // Foreground — keep pixel, use confidence for edge smoothing
                    val alpha = (confidence * 255).toInt().coerceIn(0, 255)
                    outputBitmap.setPixel(x, y, Color.argb(
                      alpha,
                      Color.red(pixel),
                      Color.green(pixel),
                      Color.blue(pixel)
                    ))
                  } else {
                    // Background — transparent
                    outputBitmap.setPixel(x, y, Color.TRANSPARENT)
                  }
                }
              }

              // Save as PNG (supports transparency)
              val outputFile = File(outputPath)
              outputFile.parentFile?.mkdirs()
              val fos = FileOutputStream(outputFile)
              outputBitmap.compress(Bitmap.CompressFormat.PNG, 100, fos)
              fos.flush()
              fos.close()

              bitmap.recycle()
              outputBitmap.recycle()

              promise.resolve(mapOf(
                "path" to outputPath,
                "size" to outputFile.length(),
                "width" to width,
                "height" to height
              ))
            } catch (e: Exception) {
              promise.reject("ERR_PROCESS", "Failed to process mask: ${e.message}", e)
            }
          }
          .addOnFailureListener { e ->
            bitmap.recycle()
            promise.reject("ERR_SEGMENT", "Segmentation failed: ${e.message}", e)
          }

      } catch (e: Exception) {
        promise.reject("ERR_BG_REMOVE", "Background removal failed: ${e.message}", e)
      }
    }
  }
}
