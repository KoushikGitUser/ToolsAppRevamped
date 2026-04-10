package expo.modules.pdftools

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import com.tom_roush.pdfbox.rendering.PDFRenderer
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfDocument
import android.util.Base64
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.android.gms.tasks.Tasks
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class PdfToolsModule : Module() {

  private var pdfBoxInitialized = false

  private fun ensurePdfBox() {
    if (!pdfBoxInitialized) {
      val context = appContext.reactContext ?: return
      PDFBoxResourceLoader.init(context)
      pdfBoxInitialized = true
    }
  }

  private fun resolveFilePath(inputPath: String): String {
    return inputPath.removePrefix("file://")
  }

  private fun openDocument(inputPath: String): PDDocument {
    val context = appContext.reactContext
    val uri = Uri.parse(inputPath)
    if (uri.scheme == "content" && context != null) {
      val inputStream = context.contentResolver.openInputStream(uri)
        ?: throw Exception("Could not open file")
      return PDDocument.load(inputStream)
    }
    return PDDocument.load(File(resolveFilePath(inputPath)))
  }

  private fun getInputStream(inputPath: String): java.io.InputStream {
    val context = appContext.reactContext
    val uri = Uri.parse(inputPath)
    if (uri.scheme == "content" && context != null) {
      return context.contentResolver.openInputStream(uri)
        ?: throw Exception("Could not open file")
    }
    return FileInputStream(File(resolveFilePath(inputPath)))
  }

  override fun definition() = ModuleDefinition {
    Name("PdfTools")

    // getPdfInfo(inputPath) -> { pageCount, size }
    AsyncFunction("getPdfInfo") { inputPath: String, promise: Promise ->
      try {
        ensurePdfBox()
        val doc = openDocument(inputPath)
        val pageCount = doc.numberOfPages
        doc.close()

        // Get file size
        val context = appContext.reactContext
        val uri = Uri.parse(inputPath)
        val size: Long = if (uri.scheme == "content" && context != null) {
          val fd = context.contentResolver.openFileDescriptor(uri, "r")
          val s = fd?.statSize ?: 0L
          fd?.close()
          s
        } else {
          File(resolveFilePath(inputPath)).length()
        }

        promise.resolve(mapOf(
          "pageCount" to pageCount,
          "size" to size
        ))
      } catch (e: Exception) {
        promise.reject("ERR_PDF_INFO", "Failed to get PDF info: ${e.message}", e)
      }
    }

    // mergePdfs(inputPaths[], outputPath) -> { path, size, pageCount }
    AsyncFunction("mergePdfs") { inputPaths: List<String>, outputPath: String, promise: Promise ->
      try {
        ensurePdfBox()

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        if (outputFile.exists()) outputFile.delete()

        val merger = PDFMergerUtility()
        merger.destinationFileName = outputFile.absolutePath

        for (path in inputPaths) {
          merger.addSource(getInputStream(path))
        }

        merger.mergeDocuments(null)

        // Get page count of merged document
        val mergedDoc = PDDocument.load(outputFile)
        val pageCount = mergedDoc.numberOfPages
        mergedDoc.close()

        promise.resolve(mapOf(
          "path" to outputFile.absolutePath,
          "size" to outputFile.length(),
          "pageCount" to pageCount
        ))
      } catch (e: Exception) {
        promise.reject("ERR_MERGE", "Failed to merge PDFs: ${e.message}", e)
      }
    }

    // splitPdf(inputPath, outputDir, baseName) -> { paths[], sizes[], pageCount }
    AsyncFunction("splitPdf") { inputPath: String, outputDir: String, baseName: String, promise: Promise ->
      try {
        ensurePdfBox()

        val outDir = File(outputDir)
        outDir.mkdirs()

        val sourceDoc = openDocument(inputPath)
        val totalPages = sourceDoc.numberOfPages
        val paths = mutableListOf<String>()
        val sizes = mutableListOf<Long>()

        for (i in 0 until totalPages) {
          val newDoc = PDDocument()
          newDoc.addPage(sourceDoc.getPage(i))

          val outFile = File(outDir, "${baseName}_page_${i + 1}.pdf")
          if (outFile.exists()) outFile.delete()

          newDoc.save(outFile)
          newDoc.close()

          paths.add(outFile.absolutePath)
          sizes.add(outFile.length())
        }

        sourceDoc.close()

        promise.resolve(mapOf(
          "paths" to paths,
          "sizes" to sizes,
          "pageCount" to totalPages
        ))
      } catch (e: Exception) {
        promise.reject("ERR_SPLIT", "Failed to split PDF: ${e.message}", e)
      }
    }

    // extractPages(inputPath, pages[], outputPath) -> { path, size, pageCount }
    AsyncFunction("extractPages") { inputPath: String, pages: List<Int>, outputPath: String, promise: Promise ->
      try {
        ensurePdfBox()

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        if (outputFile.exists()) outputFile.delete()

        val sourceDoc = openDocument(inputPath)
        val newDoc = PDDocument()

        // pages are 1-indexed from JS
        for (pageNum in pages) {
          val zeroIndex = pageNum - 1
          if (zeroIndex >= 0 && zeroIndex < sourceDoc.numberOfPages) {
            newDoc.addPage(sourceDoc.getPage(zeroIndex))
          }
        }

        if (newDoc.numberOfPages == 0) {
          newDoc.close()
          sourceDoc.close()
          promise.reject("ERR_NO_PAGES", "No valid pages selected", null)
          return@AsyncFunction
        }

        newDoc.save(outputFile)
        val pageCount = newDoc.numberOfPages
        newDoc.close()
        sourceDoc.close()

        promise.resolve(mapOf(
          "path" to outputFile.absolutePath,
          "size" to outputFile.length(),
          "pageCount" to pageCount
        ))
      } catch (e: Exception) {
        promise.reject("ERR_EXTRACT", "Failed to extract pages: ${e.message}", e)
      }
    }

    // lockPdf(inputPath, password, outputPath) -> { path, size, pageCount }
    AsyncFunction("lockPdf") { inputPath: String, password: String, outputPath: String, promise: Promise ->
      try {
        ensurePdfBox()

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        if (outputFile.exists()) outputFile.delete()

        val doc = openDocument(inputPath)

        val accessPermission = AccessPermission()
        // Allow printing and reading but require password to open
        val protectionPolicy = StandardProtectionPolicy(password, password, accessPermission)
        protectionPolicy.encryptionKeyLength = 128
        protectionPolicy.permissions = accessPermission

        doc.protect(protectionPolicy)
        doc.save(outputFile)
        val pageCount = doc.numberOfPages
        doc.close()

        if (outputFile.exists() && outputFile.length() > 0) {
          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "pageCount" to pageCount
          ))
        } else {
          promise.reject("ERR_LOCK", "Failed to lock PDF - output file is empty", null)
        }
      } catch (e: Exception) {
        promise.reject("ERR_LOCK", "Failed to lock PDF: ${e.message}", e)
      }
    }

    // unlockPdf(inputPath, password, outputPath) -> { path, size, pageCount }
    AsyncFunction("unlockPdf") { inputPath: String, password: String, outputPath: String, promise: Promise ->
      try {
        ensurePdfBox()

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        if (outputFile.exists()) outputFile.delete()

        val context = appContext.reactContext
        val uri = Uri.parse(inputPath)
        val doc: PDDocument
        try {
          if (uri.scheme == "content" && context != null) {
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            doc = PDDocument.load(inputStream, password)
          } else {
            doc = PDDocument.load(File(resolveFilePath(inputPath)), password)
          }
        } catch (e: Exception) {
          promise.reject("ERR_WRONG_PASSWORD", "Incorrect password or could not open PDF: ${e.message}", e)
          return@AsyncFunction
        }

        doc.setAllSecurityToBeRemoved(true)
        doc.save(outputFile)
        val pageCount = doc.numberOfPages
        doc.close()

        if (outputFile.exists() && outputFile.length() > 0) {
          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "pageCount" to pageCount
          ))
        } else {
          promise.reject("ERR_UNLOCK", "Failed to unlock PDF - output file is empty", null)
        }
      } catch (e: Exception) {
        promise.reject("ERR_UNLOCK", "Failed to unlock PDF: ${e.message}", e)
      }
    }

    // isPdfLocked(inputPath) -> { locked: Boolean, pageCount: Int }
    AsyncFunction("isPdfLocked") { inputPath: String, promise: Promise ->
      try {
        ensurePdfBox()

        val context = appContext.reactContext
        val uri = Uri.parse(inputPath)

        // Try opening without password
        try {
          val doc: PDDocument
          if (uri.scheme == "content" && context != null) {
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            doc = PDDocument.load(inputStream)
          } else {
            doc = PDDocument.load(File(resolveFilePath(inputPath)))
          }
          val isEncrypted = doc.isEncrypted
          val pageCount = doc.numberOfPages
          doc.close()

          promise.resolve(mapOf(
            "locked" to isEncrypted,
            "pageCount" to pageCount
          ))
        } catch (e: Exception) {
          // If it fails to open, it's likely password-protected
          promise.resolve(mapOf(
            "locked" to true,
            "pageCount" to 0
          ))
        }
      } catch (e: Exception) {
        promise.reject("ERR_CHECK_LOCK", "Failed to check PDF lock status: ${e.message}", e)
      }
    }

    // pdfToImages(inputPath, outputDir, quality) -> { paths[], sizes[], pageCount }
    // quality: 0-100 JPEG quality
    AsyncFunction("pdfToImages") { inputPath: String, outputDir: String, quality: Int, promise: Promise ->
      Thread {
        try {
          ensurePdfBox()

          val outDir = File(outputDir)
          outDir.mkdirs()

          // Try opening - handle encrypted PDFs with empty/owner password
          val context = appContext.reactContext
          val uri = Uri.parse(inputPath)
          val doc: PDDocument
          if (uri.scheme == "content" && context != null) {
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            doc = PDDocument.load(inputStream, "")
          } else {
            doc = PDDocument.load(File(resolveFilePath(inputPath)), "")
          }
          // Remove security so rendering works
          if (doc.isEncrypted) {
            doc.setAllSecurityToBeRemoved(true)
          }
          val renderer = PDFRenderer(doc)
          val totalPages = doc.numberOfPages
          val paths = mutableListOf<String>()
          val sizes = mutableListOf<Long>()

          for (i in 0 until totalPages) {
            // Render at 2x scale (144 DPI) for good quality
            val bitmap = renderer.renderImageWithDPI(i, 200f)

            val outFile = File(outDir, "page_${i + 1}.jpg")
            if (outFile.exists()) outFile.delete()

            val fos = FileOutputStream(outFile)
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, fos)
            fos.flush()
            fos.close()
            bitmap.recycle()

            paths.add(outFile.absolutePath)
            sizes.add(outFile.length())
          }

          doc.close()

          promise.resolve(mapOf(
            "paths" to paths,
            "sizes" to sizes,
            "pageCount" to totalPages
          ))
        } catch (e: Exception) {
          promise.reject("ERR_PDF_TO_IMAGES", "Failed to convert PDF to images: ${e.message}", e)
        }
      }.start()
    }

    // renderPage(inputPath, pageIndex, dpi) -> base64 PNG string
    AsyncFunction("renderPage") { inputPath: String, pageIndex: Int, dpi: Int, promise: Promise ->
      Thread {
        try {
          ensurePdfBox()
          val context = appContext.reactContext
          val uri = Uri.parse(inputPath)
          val doc: PDDocument
          if (uri.scheme == "content" && context != null) {
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            doc = PDDocument.load(inputStream, "")
          } else {
            doc = PDDocument.load(File(resolveFilePath(inputPath)), "")
          }
          if (doc.isEncrypted) {
            doc.setAllSecurityToBeRemoved(true)
          }

          if (pageIndex < 0 || pageIndex >= doc.numberOfPages) {
            doc.close()
            promise.reject("ERR_INVALID_PAGE", "Invalid page index: $pageIndex", null)
            return@Thread
          }

          val renderer = PDFRenderer(doc)
          val bitmap = renderer.renderImageWithDPI(pageIndex, dpi.toFloat())

          val stream = ByteArrayOutputStream()
          bitmap.compress(Bitmap.CompressFormat.JPEG, 100, stream)
          val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
          bitmap.recycle()
          stream.close()
          doc.close()

          // Force garbage collection after releasing large bitmap
          System.gc()

          promise.resolve(base64)
        } catch (e: Exception) {
          promise.reject("ERR_RENDER_PAGE", "Failed to render page: ${e.message}", e)
        }
      }.start()
    }

    // createPdfFromImages(imagePaths[], outputPath) -> { path, size, pageCount }
    AsyncFunction("createPdfFromImages") { imagePaths: List<String>, outputPath: String, promise: Promise ->
      Thread {
        try {
          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val pdfDoc = PdfDocument()

          for ((index, imgPath) in imagePaths.withIndex()) {
            val bitmap = BitmapFactory.decodeFile(imgPath)
              ?: continue

            val pageInfo = PdfDocument.PageInfo.Builder(bitmap.width, bitmap.height, index + 1).create()
            val page = pdfDoc.startPage(pageInfo)
            page.canvas.drawBitmap(bitmap, 0f, 0f, null)
            pdfDoc.finishPage(page)
            bitmap.recycle()
          }

          val fos = FileOutputStream(outputFile)
          pdfDoc.writeTo(fos)
          fos.flush()
          fos.close()
          pdfDoc.close()

          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "pageCount" to imagePaths.size
          ))
        } catch (e: Exception) {
          promise.reject("ERR_CREATE_PDF", "Failed to create PDF from images: ${e.message}", e)
        }
      }.start()
    }

    // imagesToPdfNative(imagePaths[], pageWidth, pageHeight, marginPoints, outputPath)
    //   -> { path, size, pageCount }
    // Engine: PdfBox-Android with JPEG passthrough.
    // Each image SHOULD already be a JPEG (the JS layer ensures this on pick).
    // Falls back to LosslessFactory decode for non-JPEGs as a defense-in-depth.
    AsyncFunction("imagesToPdfNative") { imagePaths: List<String>, pageWidth: Double, pageHeight: Double, marginPoints: Double, outputPath: String, promise: Promise ->
      Thread {
        var doc: PDDocument? = null
        try {
          ensurePdfBox()

          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          doc = PDDocument()
          val pageRect = PDRectangle(pageWidth.toFloat(), pageHeight.toFloat())
          val margin = marginPoints.toFloat()
          val drawableW = pageRect.width - 2 * margin
          val drawableH = pageRect.height - 2 * margin

          var addedPages = 0
          for (raw in imagePaths) {
            val cleanPath = resolveFilePath(raw)
            val file = File(cleanPath)
            if (!file.exists() || file.length() == 0L) continue

            // JPEG passthrough: bytes embedded directly, no decode, no re-encode.
            val pdImage: PDImageXObject = try {
              FileInputStream(file).use { stream ->
                JPEGFactory.createFromStream(doc, stream)
              }
            } catch (e: Exception) {
              // Fallback: decode-then-lossless (for non-JPEG images that slipped through)
              val bmp = BitmapFactory.decodeFile(cleanPath) ?: continue
              val img = LosslessFactory.createFromImage(doc, bmp)
              bmp.recycle()
              img
            }

            // object-fit: contain inside drawable area
            val srcW = pdImage.width.toFloat()
            val srcH = pdImage.height.toFloat()
            val scale = minOf(drawableW / srcW, drawableH / srcH)
            val drawW = srcW * scale
            val drawH = srcH * scale
            val drawX = margin + (drawableW - drawW) / 2f
            // PDF Y axis is bottom-up
            val drawY = margin + (drawableH - drawH) / 2f

            val page = PDPage(pageRect)
            doc.addPage(page)
            val cs = PDPageContentStream(doc, page)
            cs.drawImage(pdImage, drawX, drawY, drawW, drawH)
            cs.close()
            addedPages++
          }

          if (addedPages == 0) {
            doc.close()
            promise.reject("ERR_NO_IMAGES", "No valid images could be added", null)
            return@Thread
          }

          doc.save(outputFile)
          doc.close()
          doc = null

          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "pageCount" to addedPages
          ))
        } catch (e: Exception) {
          try { doc?.close() } catch (_: Exception) {}
          promise.reject("ERR_IMAGES_TO_PDF", "Failed to create PDF: ${e.message}", e)
        }
      }.start()
    }

    // scanQRFromImage(imagePath) -> { text, format, type }
    // Uses ML Kit Barcode Scanner to detect QR/barcodes from a static image.
    AsyncFunction("scanQRFromImage") { imagePath: String, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: throw Exception("No context")
          val uri = Uri.parse(imagePath)
          val inputImage = if (uri.scheme == "content") {
            InputImage.fromFilePath(context, uri)
          } else {
            val file = File(resolveFilePath(imagePath))
            if (!file.exists()) throw Exception("File not found")
            InputImage.fromFilePath(context, Uri.fromFile(file))
          }

          val scanner = BarcodeScanning.getClient()
          val barcodes = Tasks.await(scanner.process(inputImage))

          if (barcodes.isNotEmpty()) {
            val barcode = barcodes[0]
            promise.resolve(mapOf(
              "text" to (barcode.rawValue ?: ""),
              "format" to barcode.format,
              "type" to barcode.valueType
            ))
          } else {
            promise.reject("ERR_NO_QR", "No QR code or barcode found in the image", null)
          }
        } catch (e: Exception) {
          promise.reject("ERR_SCAN_QR", "Failed to scan QR from image: ${e.message}", e)
        }
      }.start()
    }

    // annotatePdf — draws annotations directly on original PDF (no quality loss)
    // annotations: list of maps per page, each with paths[], highlights[], texts[], images[]
    // deletedPages: list of page indices to remove
    // rotations: map of pageIndex -> rotation degrees
    AsyncFunction("annotatePdf") { inputPath: String, outputPath: String, annotationsJson: String, deletedPages: List<Int>, rotationsJson: String, promise: Promise ->
      Thread {
        try {
          ensurePdfBox()
          val context = appContext.reactContext

          val doc: PDDocument
          val uri = Uri.parse(inputPath)
          if (uri.scheme == "content" && context != null) {
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            doc = PDDocument.load(inputStream, "")
          } else {
            doc = PDDocument.load(File(resolveFilePath(inputPath)), "")
          }
          if (doc.isEncrypted) {
            doc.setAllSecurityToBeRemoved(true)
          }

          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          // Parse annotations JSON
          val annMap = org.json.JSONObject(annotationsJson)
          val rotMap = org.json.JSONObject(rotationsJson)

          // Process pages
          val pagesToRemove = mutableListOf<PDPage>()
          for (i in 0 until doc.numberOfPages) {
            if (deletedPages.contains(i)) {
              pagesToRemove.add(doc.getPage(i))
              continue
            }

            val page = doc.getPage(i)
            val mediaBox = page.mediaBox
            val pageW = mediaBox.width
            val pageH = mediaBox.height

            // Get rotation for this page
            val rotation = if (rotMap.has(i.toString())) rotMap.getInt(i.toString()) else 0
            if (rotation != 0) {
              page.rotation = (page.rotation + rotation) % 360
            }

            // Get annotations for this page
            val pageKey = i.toString()
            if (!annMap.has(pageKey)) continue
            val pageAnn = annMap.getJSONObject(pageKey)

            val cs = PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true)

            // Scale factor: JS canvas width (PAGE_WIDTH) to PDF points
            // PAGE_WIDTH is approximately screen_width - 40
            // PDF page width is in points (72 per inch)
            val scaleX = pageW / 335f  // approximate JS canvas width
            val scaleY = pageH / (335f / 0.707f) // approximate JS canvas height (A4 ratio)

            // Draw highlights
            if (pageAnn.has("highlights")) {
              val highlights = pageAnn.getJSONArray("highlights")
              for (h in 0 until highlights.length()) {
                val highlight = highlights.getJSONObject(h)
                val pathD = highlight.getString("d")
                val colorHex = highlight.getString("color")
                val strokeWidth = highlight.getDouble("strokeWidth").toFloat()

                val color = parseColor(colorHex)
                cs.setStrokingColor(color[0], color[1], color[2])

                // Set transparency for highlights
                val gs = PDExtendedGraphicsState()
                gs.strokingAlphaConstant = if (color.size > 3) color[3] else 0.5f
                cs.setGraphicsStateParameters(gs)

                cs.setLineWidth(strokeWidth * scaleX)
                cs.setLineCapStyle(1)
                drawSvgPath(cs, pathD, scaleX, scaleY, pageH)

                // Reset alpha
                val gsReset = PDExtendedGraphicsState()
                gsReset.strokingAlphaConstant = 1f
                cs.setGraphicsStateParameters(gsReset)
              }
            }

            // Draw paths (drawings)
            if (pageAnn.has("paths")) {
              val paths = pageAnn.getJSONArray("paths")
              for (p in 0 until paths.length()) {
                val path = paths.getJSONObject(p)
                val pathD = path.getString("d")
                val colorHex = path.getString("color")
                val strokeWidth = path.getDouble("strokeWidth").toFloat()

                val color = parseColor(colorHex)
                cs.setStrokingColor(color[0], color[1], color[2])

                val gs = PDExtendedGraphicsState()
                gs.strokingAlphaConstant = 1f
                cs.setGraphicsStateParameters(gs)

                cs.setLineWidth(strokeWidth * scaleX)
                cs.setLineCapStyle(1)
                drawSvgPath(cs, pathD, scaleX, scaleY, pageH)
              }
            }

            // Draw texts
            if (pageAnn.has("texts")) {
              val texts = pageAnn.getJSONArray("texts")
              for (t in 0 until texts.length()) {
                val textObj = texts.getJSONObject(t)
                val text = textObj.getString("text")
                val x = textObj.getDouble("x").toFloat()
                val y = textObj.getDouble("y").toFloat()
                val fontSize = textObj.getDouble("size").toFloat()
                val colorHex = textObj.getString("color")
                val bold = if (textObj.has("bold")) textObj.getBoolean("bold") else false
                val scale = if (textObj.has("scale")) textObj.getDouble("scale").toFloat() else 1f

                val color = parseColor(colorHex)
                val font = if (bold) PDType1Font.HELVETICA_BOLD else PDType1Font.HELVETICA

                cs.beginText()
                cs.setFont(font, fontSize * scale * scaleX)
                cs.setNonStrokingColor(color[0], color[1], color[2])
                // PDF Y is bottom-up, JS Y is top-down
                cs.newLineAtOffset(x * scaleX, pageH - (y + fontSize) * scaleY)
                cs.showText(text)
                cs.endText()
              }
            }

            // Draw images
            if (pageAnn.has("images") && context != null) {
              val images = pageAnn.getJSONArray("images")
              for (img in 0 until images.length()) {
                val imgObj = images.getJSONObject(img)
                val imgUri = imgObj.getString("uri")
                val imgX = imgObj.getDouble("x").toFloat()
                val imgY = imgObj.getDouble("y").toFloat()
                val imgW = imgObj.getDouble("width").toFloat()
                val imgH = imgObj.getDouble("height").toFloat()

                try {
                  val inputStream = if (imgUri.startsWith("content://")) {
                    context.contentResolver.openInputStream(Uri.parse(imgUri))
                  } else {
                    java.io.FileInputStream(File(resolveFilePath(imgUri)))
                  }
                  val bitmap = BitmapFactory.decodeStream(inputStream)
                  inputStream?.close()
                  if (bitmap != null) {
                    val pdImage = LosslessFactory.createFromImage(doc, bitmap)
                    cs.drawImage(pdImage, imgX * scaleX, pageH - (imgY + imgH) * scaleY, imgW * scaleX, imgH * scaleY)
                    bitmap.recycle()
                  }
                } catch (_: Exception) {}
              }
            }

            // Draw signatures (as paths)
            if (pageAnn.has("signatures")) {
              val signatures = pageAnn.getJSONArray("signatures")
              for (s in 0 until signatures.length()) {
                val sig = signatures.getJSONObject(s)
                val sigX = sig.getDouble("x").toFloat()
                val sigY = sig.getDouble("y").toFloat()
                val sigPaths = sig.getJSONArray("paths")

                cs.setStrokingColor(0f, 0f, 0f)
                cs.setLineWidth(2f * scaleX)
                cs.setLineCapStyle(1)

                val gs = PDExtendedGraphicsState()
                gs.strokingAlphaConstant = 1f
                cs.setGraphicsStateParameters(gs)

                // Signature viewBox: ~(screenWidth*0.9-48) x 160, rendered at 150x75 on canvas
                val sigScaleX = 150f / (335f * 0.9f - 48f)
                val sigScaleY = 75f / 160f

                for (sp in 0 until sigPaths.length()) {
                  val spObj = sigPaths.getJSONObject(sp)
                  if (!spObj.has("d") || spObj.getString("d").isEmpty()) continue
                  val pathD = spObj.getString("d")
                  drawSvgPathOffset(cs, pathD, sigScaleX * scaleX, sigScaleY * scaleY, sigX * scaleX, pageH - (sigY + 75) * scaleY, pageH)
                }
              }
            }

            cs.close()
          }

          // Remove deleted pages
          for (page in pagesToRemove.reversed()) {
            doc.removePage(page)
          }

          doc.save(outputFile)
          doc.close()

          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "pageCount" to doc.numberOfPages
          ))
        } catch (e: Exception) {
          promise.reject("ERR_ANNOTATE_PDF", "Failed to annotate PDF: ${e.message}", e)
        }
      }.start()
    }
  }

  private fun parseColor(hex: String): FloatArray {
    val clean = hex.removePrefix("#")
    return if (clean.length == 8) {
      // RRGGBBAA
      floatArrayOf(
        Integer.parseInt(clean.substring(0, 2), 16) / 255f,
        Integer.parseInt(clean.substring(2, 4), 16) / 255f,
        Integer.parseInt(clean.substring(4, 6), 16) / 255f,
        Integer.parseInt(clean.substring(6, 8), 16) / 255f
      )
    } else if (clean.length == 6) {
      floatArrayOf(
        Integer.parseInt(clean.substring(0, 2), 16) / 255f,
        Integer.parseInt(clean.substring(2, 4), 16) / 255f,
        Integer.parseInt(clean.substring(4, 6), 16) / 255f
      )
    } else {
      floatArrayOf(0f, 0f, 0f)
    }
  }

  private fun drawSvgPath(cs: PDPageContentStream, d: String, scaleX: Float, scaleY: Float, pageH: Float) {
    val tokens = d.replace(",", " ").split(Regex("(?=[MLQCZmlqcz])")).filter { it.isNotBlank() }
    var started = false
    for (token in tokens) {
      val cmd = token[0]
      val nums = token.substring(1).trim().split(Regex("\\s+")).filter { it.isNotBlank() }.mapNotNull { it.toFloatOrNull() }
      when (cmd) {
        'M' -> {
          if (nums.size >= 2) {
            if (started) cs.stroke()
            cs.moveTo(nums[0] * scaleX, pageH - nums[1] * scaleY)
            started = true
          }
        }
        'L' -> {
          if (nums.size >= 2) cs.lineTo(nums[0] * scaleX, pageH - nums[1] * scaleY)
        }
        'Q' -> {
          if (nums.size >= 4) cs.curveTo1(nums[0] * scaleX, pageH - nums[1] * scaleY, nums[2] * scaleX, pageH - nums[3] * scaleY)
        }
      }
    }
    if (started) cs.stroke()
  }

  private fun drawSvgPathOffset(cs: PDPageContentStream, d: String, scaleX: Float, scaleY: Float, offsetX: Float, offsetY: Float, pageH: Float) {
    val tokens = d.replace(",", " ").split(Regex("(?=[MLQCZmlqcz])")).filter { it.isNotBlank() }
    var started = false
    for (token in tokens) {
      val cmd = token[0]
      val nums = token.substring(1).trim().split(Regex("\\s+")).filter { it.isNotBlank() }.mapNotNull { it.toFloatOrNull() }
      when (cmd) {
        'M' -> {
          if (nums.size >= 2) {
            if (started) cs.stroke()
            cs.moveTo(offsetX + nums[0] * scaleX, offsetY + nums[1] * scaleY)
            started = true
          }
        }
        'L' -> {
          if (nums.size >= 2) cs.lineTo(offsetX + nums[0] * scaleX, offsetY + nums[1] * scaleY)
        }
        'Q' -> {
          if (nums.size >= 4) cs.curveTo1(offsetX + nums[0] * scaleX, offsetY + nums[1] * scaleY, offsetX + nums[2] * scaleX, offsetY + nums[3] * scaleY)
        }
      }
    }
    if (started) cs.stroke()
  }
}
