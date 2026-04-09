import ExpoModulesCore
import UIKit

public class TextToPdfModule: Module {
    public func definition() -> ModuleDefinition {
        Name("TextToPdf")

        AsyncFunction("generatePdf") { (text: String, title: String, outputPath: String, pageWidth: Int, pageHeight: Int, fontSize: Double) -> [String: Any] in
            return try self.generatePdf(
                text: text,
                title: title,
                outputPath: outputPath,
                pageWidth: pageWidth,
                pageHeight: pageHeight,
                fontSize: CGFloat(fontSize)
            )
        }
    }

    private func generatePdf(
        text: String,
        title: String,
        outputPath: String,
        pageWidth: Int,
        pageHeight: Int,
        fontSize: CGFloat
    ) throws -> [String: Any] {
        let pageRect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        let margin: CGFloat = 40
        let contentWidth = CGFloat(pageWidth) - 2 * margin
        let lineHeight = fontSize * 1.5
        let titleFontSize = fontSize * 1.6
        let titleLineHeight = titleFontSize * 1.4

        let titleFont = UIFont.boldSystemFont(ofSize: titleFontSize)
        let bodyFont = UIFont.systemFont(ofSize: fontSize)

        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: UIColor.black
        ]
        let bodyAttrs: [NSAttributedString.Key: Any] = [
            .font: bodyFont,
            .foregroundColor: UIColor.black
        ]

        let pdfRenderer = UIGraphicsPDFRenderer(bounds: pageRect)
        var totalPages = 0

        let data = pdfRenderer.pdfData { ctx in
            ctx.beginPage()
            UIColor.white.setFill()
            UIRectFill(pageRect)
            totalPages = 1
            var y = margin + fontSize

            // Draw title
            if !title.isEmpty {
                let titleLines = self.wrapText(title, font: titleFont, maxWidth: contentWidth)
                for line in titleLines {
                    (line as NSString).draw(at: CGPoint(x: margin, y: y), withAttributes: titleAttrs)
                    y += titleLineHeight
                }
                y += lineHeight * 0.3
                UIColor.lightGray.setStroke()
                let path = UIBezierPath()
                path.move(to: CGPoint(x: margin, y: y))
                path.addLine(to: CGPoint(x: CGFloat(pageWidth) - margin, y: y))
                path.lineWidth = 1
                path.stroke()
                y += lineHeight * 2.0
            }

            // Draw body
            let bodyLines = self.wrapTextWithParagraphs(text, font: bodyFont, maxWidth: contentWidth)
            for line in bodyLines {
                if line.isEmpty {
                    y += lineHeight * 0.5
                    continue
                }
                if y > CGFloat(pageHeight) - margin {
                    ctx.beginPage()
                    UIColor.white.setFill()
                    UIRectFill(pageRect)
                    totalPages += 1
                    y = margin + fontSize
                }
                (line as NSString).draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttrs)
                y += lineHeight
            }
        }

        let url = URL(fileURLWithPath: outputPath)
        try data.write(to: url)

        return [
            "path": outputPath,
            "pages": totalPages,
            "size": data.count
        ]
    }

    private func wrapText(_ text: String, font: UIFont, maxWidth: CGFloat) -> [String] {
        var result: [String] = []
        let words = text.components(separatedBy: " ")
        var currentLine = ""

        for word in words {
            let testLine = currentLine.isEmpty ? word : "\(currentLine) \(word)"
            let width = (testLine as NSString).size(withAttributes: [.font: font]).width
            if width <= maxWidth {
                currentLine = testLine
            } else {
                if !currentLine.isEmpty { result.append(currentLine) }
                currentLine = word
            }
        }
        if !currentLine.isEmpty { result.append(currentLine) }
        return result
    }

    private func wrapTextWithParagraphs(_ text: String, font: UIFont, maxWidth: CGFloat) -> [String] {
        var result: [String] = []
        let paragraphs = text.components(separatedBy: "\n")

        for paragraph in paragraphs {
            if paragraph.trimmingCharacters(in: .whitespaces).isEmpty {
                result.append("")
                continue
            }
            result.append(contentsOf: wrapText(paragraph, font: font, maxWidth: maxWidth))
        }
        return result
    }
}
