package expo.modules.colorpicker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ColorPickerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ColorPicker")

    // getPixelColor(imagePath, x, y, imageWidth, imageHeight) -> { r, g, b, a, hex }
    // x, y are tap coordinates relative to the displayed image dimensions
    // imageWidth, imageHeight are the displayed image dimensions (used to map to actual bitmap pixels)
    AsyncFunction("getPixelColor") { imagePath: String, x: Double, y: Double, displayWidth: Double, displayHeight: Double, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: run {
            promise.reject("ERR_NO_CONTEXT", "React context is not available", null)
            return@Thread
          }

          // Decode the full bitmap
          val uri = Uri.parse(imagePath)
          val bitmap: Bitmap? = if (uri.scheme == "content") {
            val inputStream = context.contentResolver.openInputStream(uri)
            if (inputStream == null) {
              promise.reject("ERR_OPEN_FILE", "Could not open image", null)
              return@Thread
            }
            BitmapFactory.decodeStream(inputStream).also { inputStream.close() }
          } else {
            val rawPath = imagePath.replace("file://", "")
            BitmapFactory.decodeFile(rawPath)
          }

          if (bitmap == null) {
            promise.reject("ERR_DECODE", "Could not decode image", null)
            return@Thread
          }

          // Map display coordinates to actual bitmap pixel coordinates
          val scaleX = bitmap.width.toDouble() / displayWidth
          val scaleY = bitmap.height.toDouble() / displayHeight
          val pixelX = (x * scaleX).toInt().coerceIn(0, bitmap.width - 1)
          val pixelY = (y * scaleY).toInt().coerceIn(0, bitmap.height - 1)

          val pixel = bitmap.getPixel(pixelX, pixelY)

          val a = (pixel shr 24) and 0xFF
          val r = (pixel shr 16) and 0xFF
          val g = (pixel shr 8) and 0xFF
          val b = pixel and 0xFF

          val hex = String.format("#%02X%02X%02X", r, g, b)

          bitmap.recycle()

          promise.resolve(mapOf(
            "r" to r,
            "g" to g,
            "b" to b,
            "a" to a,
            "hex" to hex
          ))
        } catch (e: Exception) {
          promise.reject("ERR_COLOR_PICK", "Failed to pick color: ${e.message}", e)
        }
      }.start()
    }
  }
}
