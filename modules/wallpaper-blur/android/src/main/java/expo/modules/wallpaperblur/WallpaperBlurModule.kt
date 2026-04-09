package expo.modules.wallpaperblur

import android.app.WallpaperManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.max

class WallpaperBlurModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("WallpaperBlur")

        // Get current wallpaper and save to temp file for preview
        AsyncFunction("getWallpaper") {
            val context = appContext.reactContext ?: throw Exception("Context not available")
            val wm = WallpaperManager.getInstance(context)
            val drawable = wm.drawable ?: throw Exception("Could not read wallpaper. This may happen with live wallpapers or restricted devices.")

            val bitmap = if (drawable is BitmapDrawable) {
                drawable.bitmap
            } else {
                val bmp = Bitmap.createBitmap(drawable.intrinsicWidth, drawable.intrinsicHeight, Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(bmp)
                drawable.setBounds(0, 0, canvas.width, canvas.height)
                drawable.draw(canvas)
                bmp
            }

            val tempFile = File(context.cacheDir, "current_wallpaper_${System.currentTimeMillis()}.jpg")
            FileOutputStream(tempFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
            }

            mapOf(
                "uri" to "file://${tempFile.absolutePath}",
                "width" to bitmap.width,
                "height" to bitmap.height
            )
        }

        // Blur an image (from URI) and return blurred image URI
        AsyncFunction("blurImage") { uriString: String, radius: Int ->
            val context = appContext.reactContext ?: throw Exception("Context not available")
            val clampedRadius = min(max(radius, 1), 150)

            val uri = Uri.parse(uriString)
            val bitmap = if (uriString.startsWith("file://") || uriString.startsWith("/")) {
                val path = uriString.removePrefix("file://")
                BitmapFactory.decodeFile(path) ?: throw Exception("Could not decode image")
            } else {
                val inputStream = context.contentResolver.openInputStream(uri)
                    ?: throw Exception("Could not open image")
                val bmp = BitmapFactory.decodeStream(inputStream)
                inputStream.close()
                bmp ?: throw Exception("Could not decode image")
            }

            // Work on a mutable copy
            val mutableBitmap = bitmap.copy(Bitmap.Config.ARGB_8888, true)
            if (bitmap != mutableBitmap) bitmap.recycle()

            // Apply stack blur
            stackBlur(mutableBitmap, clampedRadius)

            val tempFile = File(context.cacheDir, "blurred_wallpaper_${System.currentTimeMillis()}.jpg")
            FileOutputStream(tempFile).use { out ->
                mutableBitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
            }
            mutableBitmap.recycle()

            mapOf("uri" to "file://${tempFile.absolutePath}")
        }

        // Set wallpaper from a file URI
        AsyncFunction("setWallpaper") { uriString: String, target: Int ->
            val context = appContext.reactContext ?: throw Exception("Context not available")
            val path = uriString.removePrefix("file://")
            val bitmap = BitmapFactory.decodeFile(path) ?: throw Exception("Could not decode image")

            val wm = WallpaperManager.getInstance(context)

            when (target) {
                0 -> wm.setBitmap(bitmap) // Both
                1 -> wm.setBitmap(bitmap, null, true, WallpaperManager.FLAG_SYSTEM) // Home only
                2 -> wm.setBitmap(bitmap, null, true, WallpaperManager.FLAG_LOCK)   // Lock only
            }

            bitmap.recycle()
            mapOf("success" to true)
        }
    }

    // Stack blur algorithm - operates directly on the bitmap pixels
    private fun stackBlur(bitmap: Bitmap, radius: Int) {
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        val div = 2 * radius + 1
        val divSum = (div + 1) shr 1
        val divSumSq = divSum * divSum

        val rArr = IntArray(w * h)
        val gArr = IntArray(w * h)
        val bArr = IntArray(w * h)

        var rSum: Int; var gSum: Int; var bSum: Int
        var rInSum: Int; var gInSum: Int; var bInSum: Int
        var rOutSum: Int; var gOutSum: Int; var bOutSum: Int

        val stack = Array(div) { IntArray(3) }
        var stackPointer: Int
        var stackStart: Int
        var sir: IntArray
        var rbs: Int

        val mulSum = IntArray(256)
        val shgSum = IntArray(256)

        // Precompute lookup tables
        val mulTable = intArrayOf(
            512,512,456,512,328,456,335,512,405,328,271,456,388,335,292,512,
            454,405,364,328,298,271,496,456,420,388,360,335,312,292,273,512,
            482,454,428,405,383,364,345,328,312,298,284,271,259,496,475,456,
            437,420,404,388,374,360,347,335,323,312,302,292,282,273,265,512,
            497,482,468,454,441,428,417,405,394,383,373,364,354,345,337,328,
            320,312,305,298,291,284,278,271,265,259,507,496,485,475,465,456,
            446,437,428,420,412,404,396,388,381,374,367,360,354,347,341,335,
            329,323,318,312,307,302,297,292,287,282,278,273,269,265,261,512,
            505,497,489,482,475,468,461,454,447,441,435,428,422,417,411,405,
            399,394,389,383,378,373,368,364,359,354,350,345,341,337,332,328,
            324,320,316,312,309,305,301,298,294,291,287,284,281,278,274,271,
            268,265,262,259,257,507,501,496,491,485,480,475,470,465,460,456,
            451,446,442,437,433,428,424,420,416,412,408,404,400,396,392,388,
            385,381,377,374,370,367,363,360,357,354,350,347,344,341,338,335,
            332,329,326,323,320,318,315,312,310,307,304,302,299,297,294,292,
            289,287,285,282,280,278,275,273,271,269,267,265,263,261,259
        )

        val shgTable = intArrayOf(
            9,11,12,13,13,14,14,15,15,15,15,16,16,16,16,17,
            17,17,17,17,17,17,18,18,18,18,18,18,18,18,18,19,
            19,19,19,19,19,19,19,19,19,19,19,19,19,20,20,20,
            20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,
            21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,
            21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,
            22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,
            22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,23,
            23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,
            23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,
            23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,
            23,23,23,23,23,24,24,24,24,24,24,24,24,24,24,24,
            24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,
            24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,
            24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,
            24,24,24,24,24,24,24,24,24,24,24,24,24,24,24
        )

        val mulSumVal = mulTable[radius]
        val shgSumVal = shgTable[radius]

        // Horizontal pass
        for (y in 0 until h) {
            rSum = 0; gSum = 0; bSum = 0
            rInSum = 0; gInSum = 0; bInSum = 0
            rOutSum = 0; gOutSum = 0; bOutSum = 0

            for (i in -radius..radius) {
                val px = pixels[y * w + min(max(i, 0), w - 1)]
                sir = stack[i + radius]
                sir[0] = (px shr 16) and 0xff
                sir[1] = (px shr 8) and 0xff
                sir[2] = px and 0xff

                rbs = radius + 1 - Math.abs(i)
                rSum += sir[0] * rbs
                gSum += sir[1] * rbs
                bSum += sir[2] * rbs

                if (i > 0) {
                    rInSum += sir[0]; gInSum += sir[1]; bInSum += sir[2]
                } else {
                    rOutSum += sir[0]; gOutSum += sir[1]; bOutSum += sir[2]
                }
            }
            stackPointer = radius

            for (x in 0 until w) {
                val idx = y * w + x
                rArr[idx] = (rSum * mulSumVal) ushr shgSumVal
                gArr[idx] = (gSum * mulSumVal) ushr shgSumVal
                bArr[idx] = (bSum * mulSumVal) ushr shgSumVal

                rSum -= rOutSum; gSum -= gOutSum; bSum -= bOutSum

                stackStart = stackPointer - radius + div
                sir = stack[stackStart % div]
                rOutSum -= sir[0]; gOutSum -= sir[1]; bOutSum -= sir[2]

                val nextX = min(x + radius + 1, w - 1)
                val px = pixels[y * w + nextX]
                sir[0] = (px shr 16) and 0xff
                sir[1] = (px shr 8) and 0xff
                sir[2] = px and 0xff

                rInSum += sir[0]; gInSum += sir[1]; bInSum += sir[2]
                rSum += rInSum; gSum += gInSum; bSum += bInSum

                stackPointer = (stackPointer + 1) % div
                sir = stack[stackPointer]
                rOutSum += sir[0]; gOutSum += sir[1]; bOutSum += sir[2]
                rInSum -= sir[0]; gInSum -= sir[1]; bInSum -= sir[2]
            }
        }

        // Vertical pass
        for (x in 0 until w) {
            rSum = 0; gSum = 0; bSum = 0
            rInSum = 0; gInSum = 0; bInSum = 0
            rOutSum = 0; gOutSum = 0; bOutSum = 0

            for (i in -radius..radius) {
                val yy = min(max(i, 0), h - 1)
                val idx = yy * w + x
                sir = stack[i + radius]
                sir[0] = rArr[idx]
                sir[1] = gArr[idx]
                sir[2] = bArr[idx]

                rbs = radius + 1 - Math.abs(i)
                rSum += sir[0] * rbs
                gSum += sir[1] * rbs
                bSum += sir[2] * rbs

                if (i > 0) {
                    rInSum += sir[0]; gInSum += sir[1]; bInSum += sir[2]
                } else {
                    rOutSum += sir[0]; gOutSum += sir[1]; bOutSum += sir[2]
                }
            }
            stackPointer = radius

            for (y in 0 until h) {
                val r = min((rSum * mulSumVal) ushr shgSumVal, 255)
                val g = min((gSum * mulSumVal) ushr shgSumVal, 255)
                val b = min((bSum * mulSumVal) ushr shgSumVal, 255)
                pixels[y * w + x] = (0xff shl 24) or (r shl 16) or (g shl 8) or b

                rSum -= rOutSum; gSum -= gOutSum; bSum -= bOutSum

                stackStart = stackPointer - radius + div
                sir = stack[stackStart % div]
                rOutSum -= sir[0]; gOutSum -= sir[1]; bOutSum -= sir[2]

                val nextY = min(y + radius + 1, h - 1)
                val idx = nextY * w + x
                sir[0] = rArr[idx]
                sir[1] = gArr[idx]
                sir[2] = bArr[idx]

                rInSum += sir[0]; gInSum += sir[1]; bInSum += sir[2]
                rSum += rInSum; gSum += gInSum; bSum += bInSum

                stackPointer = (stackPointer + 1) % div
                sir = stack[stackPointer]
                rOutSum += sir[0]; gOutSum += sir[1]; bOutSum += sir[2]
                rInSum -= sir[0]; gInSum -= sir[1]; bInSum -= sir[2]
            }
        }

        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
    }
}
