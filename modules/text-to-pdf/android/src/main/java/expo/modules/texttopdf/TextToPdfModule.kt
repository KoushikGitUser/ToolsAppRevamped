package expo.modules.texttopdf

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.Handler
import android.os.Looper
import android.text.Html
import android.text.Layout
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.text.style.StrikethroughSpan
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.File
import java.io.FileOutputStream

class TextToPdfModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TextToPdf")

        AsyncFunction("generatePdf") { text: String, title: String, outputPath: String, pageWidth: Int, pageHeight: Int, fontSize: Double ->
            generatePdfInternal(text, title, outputPath, pageWidth, pageHeight, fontSize.toFloat())
        }

        AsyncFunction("generateRichPdf") { html: String, title: String, outputPath: String, pageWidth: Int, pageHeight: Int, fontSize: Double ->
            generateRichPdfInternal(html, title, outputPath, pageWidth, pageHeight, fontSize.toFloat())
        }

        AsyncFunction("generateHtmlPdf") { html: String, title: String, outputPath: String, pageWidth: Int, pageHeight: Int, promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject("ERR_CONTEXT", "Context not available", null)
                return@AsyncFunction
            }

            Handler(Looper.getMainLooper()).post {
                try {
                    val webView = WebView(context)
                    webView.settings.javaScriptEnabled = true
                    webView.settings.allowFileAccess = true
                    webView.layout(0, 0, pageWidth * 3, pageHeight * 3)

                    val titleHtml = if (title.isNotEmpty()) {
                        "<h1 style='font-size:24px;font-weight:bold;margin-bottom:8px;'>$title</h1><hr style='border:none;border-top:1px solid #ccc;margin-bottom:20px;'/>"
                    } else ""

                    val fullHtml = """
                        <html>
                        <head>
                            <meta name="viewport" content="width=${pageWidth * 3}">
                            <style>
                                body { font-size: 42px; line-height: 1.6; padding: 80px; margin: 0; color: #000; font-family: sans-serif; }
                                img { max-width: 100%; height: auto; border-radius: 12px; margin: 16px 0; }
                                h1, h2, h3 { margin: 20px 0 12px 0; }
                                ul, ol { padding-left: 48px; }
                                li { margin: 8px 0; }
                            </style>
                        </head>
                        <body>
                            $titleHtml
                            $html
                        </body>
                        </html>
                    """.trimIndent()

                    webView.webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView?, url: String?) {
                            Handler(Looper.getMainLooper()).postDelayed({
                                try {
                                    val outputFile = File(outputPath)
                                    outputFile.parentFile?.mkdirs()

                                    // Measure content height
                                    webView.measure(
                                        android.view.View.MeasureSpec.makeMeasureSpec(pageWidth * 3, android.view.View.MeasureSpec.EXACTLY),
                                        android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED)
                                    )
                                    val contentHeight = webView.measuredHeight
                                    webView.layout(0, 0, pageWidth * 3, contentHeight)

                                    val document = PdfDocument()
                                    val pdfPageH = pageHeight * 3
                                    var yOffset = 0
                                    var pageIndex = 1

                                    while (yOffset < contentHeight) {
                                        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth * 3, pdfPageH, pageIndex).create()
                                        val page = document.startPage(pageInfo)
                                        val canvas = page.canvas
                                        canvas.drawColor(Color.WHITE)
                                        canvas.translate(0f, -yOffset.toFloat())
                                        webView.draw(canvas)
                                        document.finishPage(page)
                                        yOffset += pdfPageH
                                        pageIndex++
                                    }

                                    FileOutputStream(outputFile).use { fos ->
                                        document.writeTo(fos)
                                    }
                                    document.close()
                                    webView.destroy()

                                    promise.resolve(mapOf(
                                        "path" to outputPath,
                                        "pages" to (pageIndex - 1),
                                        "size" to outputFile.length()
                                    ))
                                } catch (e: Exception) {
                                    webView.destroy()
                                    promise.reject("ERR_PDF", "PDF generation failed: ${e.message}", e)
                                }
                            }, 800)
                        }
                    }

                    webView.loadDataWithBaseURL(null, fullHtml, "text/html", "UTF-8", null)
                } catch (e: Exception) {
                    promise.reject("ERR_PDF", "Failed: ${e.message}", e)
                }
            }
        }
    }

    private fun generateRichPdfInternal(
        html: String,
        title: String,
        outputPath: String,
        pageWidth: Int,
        pageHeight: Int,
        fontSize: Float
    ): Map<String, Any> {
        val document = PdfDocument()
        val margin = 40f
        val contentWidth = (pageWidth - 2 * margin).toInt()
        val titleFontSize = fontSize * 1.6f
        val titleLineHeight = titleFontSize * 1.4f

        val titlePaint = TextPaint().apply {
            color = Color.BLACK
            textSize = titleFontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val bodyPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = fontSize
            typeface = Typeface.create("sans-serif", Typeface.NORMAL)
            isFakeBoldText = false
        }

        val separatorPaint = Paint().apply {
            color = Color.LTGRAY
            strokeWidth = 1f
            style = Paint.Style.STROKE
        }

        // Parse HTML to Spanned text
        val spanned = Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT)

        // Pre-build typefaces
        val tfNormal = Typeface.create("sans-serif", Typeface.NORMAL)
        val tfBold = Typeface.create("sans-serif", Typeface.BOLD)
        val tfItalic = Typeface.create("sans-serif", Typeface.ITALIC)
        val tfBoldItalic = Typeface.create("sans-serif", Typeface.BOLD_ITALIC)

        val lineHeight = fontSize * 1.6f

        var pageIndex = 1
        var currentPage = document.startPage(
            PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex).create()
        )
        var canvas = currentPage.canvas
        canvas.drawColor(Color.WHITE)
        var y = margin + fontSize

        // Draw title on first page
        if (title.isNotEmpty()) {
            val tPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = titleFontSize
                typeface = tfBold
            }
            val titleLines = wrapText(title, tPaint, contentWidth.toFloat())
            for (line in titleLines) {
                canvas.drawText(line, margin, y, tPaint)
                y += titleLineHeight
            }
            y += lineHeight * 0.2f
            canvas.drawLine(margin, y, pageWidth - margin, y, separatorPaint)
            y += lineHeight * 1.2f
        }

        // Split spanned into paragraphs and draw with formatting
        val fullText = spanned.toString()
        val paragraphs = fullText.split("\n")
        var globalOffset = 0

        for (para in paragraphs) {
            if (para.isEmpty()) {
                y += lineHeight * 0.4f
                globalOffset++ // skip the \n
                continue
            }

            // Get span runs for this paragraph
            val paraStart = globalOffset
            val paraEnd = paraStart + para.length

            // Word wrap with formatting
            val words = para.split(" ")
            var lineStart = paraStart
            var currentLineStr = StringBuilder()

            for (word in words) {
                val testLine = if (currentLineStr.isEmpty()) word else "$currentLineStr $word"
                if (bodyPaint.measureText(testLine) <= contentWidth) {
                    currentLineStr = StringBuilder(testLine)
                } else {
                    // Draw current line
                    if (currentLineStr.isNotEmpty()) {
                        if (y > pageHeight - margin) {
                            document.finishPage(currentPage)
                            pageIndex++
                            currentPage = document.startPage(
                                PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex).create()
                            )
                            canvas = currentPage.canvas
                            canvas.drawColor(Color.WHITE)
                            y = margin + fontSize
                        }
                        val lineEnd = lineStart + currentLineStr.length
                        drawStyledLine(canvas, spanned, lineStart, Math.min(lineEnd, spanned.length), margin, y, fontSize, tfNormal, tfBold, tfItalic, tfBoldItalic)
                        y += lineHeight
                        lineStart = lineEnd + 1 // +1 for space
                    }
                    currentLineStr = StringBuilder(word)
                }
            }

            // Draw remaining line
            if (currentLineStr.isNotEmpty()) {
                if (y > pageHeight - margin) {
                    document.finishPage(currentPage)
                    pageIndex++
                    currentPage = document.startPage(
                        PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex).create()
                    )
                    canvas = currentPage.canvas
                    canvas.drawColor(Color.WHITE)
                    y = margin + fontSize
                }
                val lineEnd = lineStart + currentLineStr.length
                drawStyledLine(canvas, spanned, lineStart, Math.min(lineEnd, spanned.length), margin, y, fontSize, tfNormal, tfBold, tfItalic, tfBoldItalic)
                y += lineHeight
            }

            globalOffset = paraEnd + 1 // +1 for \n
        }

        document.finishPage(currentPage)

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        FileOutputStream(outputFile).use { fos ->
            document.writeTo(fos)
        }
        document.close()

        return mapOf(
            "path" to outputPath,
            "pages" to pageIndex,
            "size" to outputFile.length()
        )
    }

    private fun generatePdfInternal(
        text: String,
        title: String,
        outputPath: String,
        pageWidth: Int,
        pageHeight: Int,
        fontSize: Float
    ): Map<String, Any> {
        val document = PdfDocument()
        val margin = 40f
        val contentWidth = pageWidth - 2 * margin
        val titleFontSize = fontSize * 1.6f
        val lineHeight = fontSize * 1.5f
        val titleLineHeight = titleFontSize * 1.4f

        val titlePaint = Paint().apply {
            color = Color.BLACK
            textSize = titleFontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val bodyPaint = Paint().apply {
            color = Color.BLACK
            textSize = fontSize
            typeface = Typeface.DEFAULT
            isAntiAlias = true
        }

        val separatorPaint = Paint().apply {
            color = Color.LTGRAY
            strokeWidth = 1f
            style = Paint.Style.STROKE
        }

        var pageIndex = 1
        var currentPage = document.startPage(
            PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex).create()
        )
        var canvas = currentPage.canvas
        canvas.drawColor(Color.WHITE)
        var y = margin + fontSize

        // Draw title on first page
        if (title.isNotEmpty()) {
            val titleLines = wrapText(title, titlePaint, contentWidth)
            for (line in titleLines) {
                canvas.drawText(line, margin, y, titlePaint)
                y += titleLineHeight
            }
            y += lineHeight * 0.3f
            canvas.drawLine(margin, y, pageWidth - margin, y, separatorPaint)
            y += lineHeight * 2.0f
        }

        // Draw body lines
        val bodyLines = wrapTextWithParagraphs(text, bodyPaint, contentWidth)
        for (line in bodyLines) {
            if (line.isEmpty()) {
                y += lineHeight * 0.5f
                continue
            }

            if (y > pageHeight - margin) {
                document.finishPage(currentPage)
                pageIndex++
                currentPage = document.startPage(
                    PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex).create()
                )
                canvas = currentPage.canvas
                canvas.drawColor(Color.WHITE)
                y = margin + fontSize
            }

            canvas.drawText(line, margin, y, bodyPaint)
            y += lineHeight
        }

        document.finishPage(currentPage)

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        FileOutputStream(outputFile).use { fos ->
            document.writeTo(fos)
        }
        document.close()

        return mapOf(
            "path" to outputPath,
            "pages" to pageIndex,
            "size" to outputFile.length()
        )
    }

    private fun wrapText(text: String, paint: Paint, maxWidth: Float): List<String> {
        val result = mutableListOf<String>()
        val words = text.split(" ")
        var currentLine = StringBuilder()

        for (word in words) {
            val testLine = if (currentLine.isEmpty()) word else "$currentLine $word"
            if (paint.measureText(testLine) <= maxWidth) {
                currentLine = StringBuilder(testLine)
            } else {
                if (currentLine.isNotEmpty()) result.add(currentLine.toString())
                currentLine = StringBuilder(word)
            }
        }
        if (currentLine.isNotEmpty()) result.add(currentLine.toString())
        return result
    }

    private fun wrapTextWithParagraphs(text: String, paint: Paint, maxWidth: Float): List<String> {
        val result = mutableListOf<String>()
        val paragraphs = text.split("\n")

        for (paragraph in paragraphs) {
            if (paragraph.trim().isEmpty()) {
                result.add("")
                continue
            }
            result.addAll(wrapText(paragraph, paint, maxWidth))
        }
        return result
    }

    private fun drawStyledLine(
        canvas: Canvas,
        spanned: Spanned,
        start: Int,
        end: Int,
        x: Float,
        y: Float,
        fontSize: Float,
        tfNormal: Typeface,
        tfBold: Typeface,
        tfItalic: Typeface,
        tfBoldItalic: Typeface
    ) {
        if (start >= end || start >= spanned.length) return
        val safeEnd = Math.min(end, spanned.length)

        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = fontSize
        }

        var drawX = x
        var pos = start

        while (pos < safeEnd) {
            // Find next span transition
            val nextTransition = spanned.nextSpanTransition(pos, safeEnd, Any::class.java)
            val chunk = spanned.subSequence(pos, nextTransition).toString()

            // Detect styles at this position
            var isBold = false
            var isItalic = false
            var isUnderline = false
            var isStrike = false

            val styleSpans = spanned.getSpans(pos, nextTransition, StyleSpan::class.java)
            for (span in styleSpans) {
                when (span.style) {
                    Typeface.BOLD -> isBold = true
                    Typeface.ITALIC -> isItalic = true
                    Typeface.BOLD_ITALIC -> { isBold = true; isItalic = true }
                }
            }
            if (spanned.getSpans(pos, nextTransition, UnderlineSpan::class.java).isNotEmpty()) isUnderline = true
            if (spanned.getSpans(pos, nextTransition, StrikethroughSpan::class.java).isNotEmpty()) isStrike = true

            // Set typeface
            paint.typeface = when {
                isBold && isItalic -> tfBoldItalic
                isBold -> tfBold
                isItalic -> tfItalic
                else -> tfNormal
            }
            paint.isUnderlineText = isUnderline
            paint.isStrikeThruText = isStrike

            canvas.drawText(chunk, drawX, y, paint)
            drawX += paint.measureText(chunk)

            pos = nextTransition
        }
    }
}
