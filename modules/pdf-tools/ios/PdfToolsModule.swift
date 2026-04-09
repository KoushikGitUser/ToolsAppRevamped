import ExpoModulesCore
import PDFKit

public class PdfToolsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfTools")

    // getPdfInfo(inputPath) -> { pageCount, size }
    AsyncFunction("getPdfInfo") { (inputPath: String, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)

      guard let doc = PDFDocument(url: url) else {
        promise.reject("ERR_PDF_INFO", "Could not open PDF file")
        return
      }

      let pageCount = doc.pageCount

      var fileSize: Int64 = 0
      if let attrs = try? FileManager.default.attributesOfItem(atPath: inputPath) {
        fileSize = attrs[.size] as? Int64 ?? 0
      }

      promise.resolve([
        "pageCount": pageCount,
        "size": fileSize
      ])
    }

    // mergePdfs(inputPaths[], outputPath) -> { path, size, pageCount }
    AsyncFunction("mergePdfs") { (inputPaths: [String], outputPath: String, promise: Promise) in
      let outputURL = URL(fileURLWithPath: outputPath)

      // Remove existing output
      try? FileManager.default.removeItem(at: outputURL)
      let parentDir = outputURL.deletingLastPathComponent()
      try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

      let mergedDoc = PDFDocument()

      for path in inputPaths {
        let url = URL(fileURLWithPath: path)
        guard let doc = PDFDocument(url: url) else {
          promise.reject("ERR_MERGE", "Could not open PDF: \(path)")
          return
        }

        for i in 0..<doc.pageCount {
          if let page = doc.page(at: i) {
            mergedDoc.insert(page, at: mergedDoc.pageCount)
          }
        }
      }

      guard mergedDoc.write(to: outputURL) else {
        promise.reject("ERR_MERGE", "Failed to write merged PDF")
        return
      }

      var fileSize: Int64 = 0
      if let attrs = try? FileManager.default.attributesOfItem(atPath: outputPath) {
        fileSize = attrs[.size] as? Int64 ?? 0
      }

      promise.resolve([
        "path": outputPath,
        "size": fileSize,
        "pageCount": mergedDoc.pageCount
      ])
    }

    // splitPdf(inputPath, outputDir, baseName) -> { paths[], sizes[], pageCount }
    AsyncFunction("splitPdf") { (inputPath: String, outputDir: String, baseName: String, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)
      let outDirURL = URL(fileURLWithPath: outputDir)

      try? FileManager.default.createDirectory(at: outDirURL, withIntermediateDirectories: true)

      guard let doc = PDFDocument(url: url) else {
        promise.reject("ERR_SPLIT", "Could not open PDF file")
        return
      }

      let totalPages = doc.pageCount
      var paths: [String] = []
      var sizes: [Int64] = []

      for i in 0..<totalPages {
        guard let page = doc.page(at: i) else { continue }

        let singleDoc = PDFDocument()
        singleDoc.insert(page, at: 0)

        let outPath = outDirURL.appendingPathComponent("\(baseName)_page_\(i + 1).pdf").path
        let outURL = URL(fileURLWithPath: outPath)

        try? FileManager.default.removeItem(at: outURL)

        guard singleDoc.write(to: outURL) else {
          promise.reject("ERR_SPLIT", "Failed to write page \(i + 1)")
          return
        }

        var fileSize: Int64 = 0
        if let attrs = try? FileManager.default.attributesOfItem(atPath: outPath) {
          fileSize = attrs[.size] as? Int64 ?? 0
        }

        paths.append(outPath)
        sizes.append(fileSize)
      }

      promise.resolve([
        "paths": paths,
        "sizes": sizes,
        "pageCount": totalPages
      ])
    }

    // extractPages(inputPath, pages[], outputPath) -> { path, size, pageCount }
    AsyncFunction("extractPages") { (inputPath: String, pages: [Int], outputPath: String, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)
      let outputURL = URL(fileURLWithPath: outputPath)

      try? FileManager.default.removeItem(at: outputURL)
      let parentDir = outputURL.deletingLastPathComponent()
      try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

      guard let doc = PDFDocument(url: url) else {
        promise.reject("ERR_EXTRACT", "Could not open PDF file")
        return
      }

      let newDoc = PDFDocument()

      // pages are 1-indexed from JS
      for pageNum in pages {
        let zeroIndex = pageNum - 1
        if zeroIndex >= 0 && zeroIndex < doc.pageCount {
          if let page = doc.page(at: zeroIndex) {
            newDoc.insert(page, at: newDoc.pageCount)
          }
        }
      }

      if newDoc.pageCount == 0 {
        promise.reject("ERR_NO_PAGES", "No valid pages selected")
        return
      }

      guard newDoc.write(to: outputURL) else {
        promise.reject("ERR_EXTRACT", "Failed to write extracted PDF")
        return
      }

      var fileSize: Int64 = 0
      if let attrs = try? FileManager.default.attributesOfItem(atPath: outputPath) {
        fileSize = attrs[.size] as? Int64 ?? 0
      }

      promise.resolve([
        "path": outputPath,
        "size": fileSize,
        "pageCount": newDoc.pageCount
      ])
    }

    // lockPdf(inputPath, password, outputPath) -> { path, size, pageCount }
    AsyncFunction("lockPdf") { (inputPath: String, password: String, outputPath: String, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)
      let outputURL = URL(fileURLWithPath: outputPath)

      try? FileManager.default.removeItem(at: outputURL)
      let parentDir = outputURL.deletingLastPathComponent()
      try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

      guard let doc = PDFDocument(url: url) else {
        promise.reject("ERR_LOCK", "Could not open PDF file")
        return
      }

      let pageCount = doc.pageCount

      // Write with password protection
      let success = doc.write(to: outputURL, withOptions: [
        PDFDocumentWriteOption.userPasswordOption: password,
        PDFDocumentWriteOption.ownerPasswordOption: password
      ])

      guard success else {
        promise.reject("ERR_LOCK", "Failed to write locked PDF")
        return
      }

      var fileSize: Int64 = 0
      if let attrs = try? FileManager.default.attributesOfItem(atPath: outputPath) {
        fileSize = attrs[.size] as? Int64 ?? 0
      }

      promise.resolve([
        "path": outputPath,
        "size": fileSize,
        "pageCount": pageCount
      ])
    }

    // unlockPdf(inputPath, password, outputPath) -> { path, size, pageCount }
    AsyncFunction("unlockPdf") { (inputPath: String, password: String, outputPath: String, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)
      let outputURL = URL(fileURLWithPath: outputPath)

      try? FileManager.default.removeItem(at: outputURL)
      let parentDir = outputURL.deletingLastPathComponent()
      try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

      guard let doc = PDFDocument(url: url) else {
        // Try with password
        guard let lockedDoc = PDFDocument(url: url) else {
          promise.reject("ERR_UNLOCK", "Could not open PDF file")
          return
        }
        guard lockedDoc.unlock(withPassword: password) else {
          promise.reject("ERR_WRONG_PASSWORD", "Incorrect password")
          return
        }

        let pageCount = lockedDoc.pageCount

        // Create new unlocked doc
        let unlockedDoc = PDFDocument()
        for i in 0..<lockedDoc.pageCount {
          if let page = lockedDoc.page(at: i) {
            unlockedDoc.insert(page, at: unlockedDoc.pageCount)
          }
        }

        guard unlockedDoc.write(to: outputURL) else {
          promise.reject("ERR_UNLOCK", "Failed to write unlocked PDF")
          return
        }

        var fileSize: Int64 = 0
        if let attrs = try? FileManager.default.attributesOfItem(atPath: outputPath) {
          fileSize = attrs[.size] as? Int64 ?? 0
        }

        promise.resolve([
          "path": outputPath,
          "size": fileSize,
          "pageCount": pageCount
        ])
        return
      }

      // If doc opened without password, try unlocking with password anyway
      if doc.isLocked {
        guard doc.unlock(withPassword: password) else {
          promise.reject("ERR_WRONG_PASSWORD", "Incorrect password")
          return
        }
      }

      let pageCount = doc.pageCount

      // Create new unlocked doc by copying pages
      let unlockedDoc = PDFDocument()
      for i in 0..<doc.pageCount {
        if let page = doc.page(at: i) {
          unlockedDoc.insert(page, at: unlockedDoc.pageCount)
        }
      }

      guard unlockedDoc.write(to: outputURL) else {
        promise.reject("ERR_UNLOCK", "Failed to write unlocked PDF")
        return
      }

      var fileSize: Int64 = 0
      if let attrs = try? FileManager.default.attributesOfItem(atPath: outputPath) {
        fileSize = attrs[.size] as? Int64 ?? 0
      }

      promise.resolve([
        "path": outputPath,
        "size": fileSize,
        "pageCount": pageCount
      ])
    }

    // isPdfLocked(inputPath) -> { locked, pageCount }
    AsyncFunction("isPdfLocked") { (inputPath: String, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)

      guard let doc = PDFDocument(url: url) else {
        // Can't open at all - likely locked
        promise.resolve([
          "locked": true,
          "pageCount": 0
        ])
        return
      }

      let isLocked = doc.isLocked || doc.isEncrypted
      let pageCount = doc.isLocked ? 0 : doc.pageCount

      promise.resolve([
        "locked": isLocked,
        "pageCount": pageCount
      ])
    }

    // pdfToImages(inputPath, outputDir, quality) -> { paths[], sizes[], pageCount }
    AsyncFunction("pdfToImages") { (inputPath: String, outputDir: String, quality: Int, promise: Promise) in
      let url = URL(fileURLWithPath: inputPath)
      let outDirURL = URL(fileURLWithPath: outputDir)

      try? FileManager.default.createDirectory(at: outDirURL, withIntermediateDirectories: true)

      guard let doc = PDFDocument(url: url) else {
        promise.reject("ERR_PDF_TO_IMAGES", "Could not open PDF file")
        return
      }

      let totalPages = doc.pageCount
      var paths: [String] = []
      var sizes: [Int64] = []
      let jpegQuality = CGFloat(quality) / 100.0

      for i in 0..<totalPages {
        guard let page = doc.page(at: i) else { continue }

        let pageRect = page.bounds(for: .mediaBox)
        let scale: CGFloat = 2.0 // 2x for good quality
        let width = pageRect.width * scale
        let height = pageRect.height * scale

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        let image = renderer.image { ctx in
          UIColor.white.set()
          ctx.fill(CGRect(origin: .zero, size: CGSize(width: width, height: height)))

          ctx.cgContext.translateBy(x: 0, y: height)
          ctx.cgContext.scaleBy(x: scale, y: -scale)

          page.draw(with: .mediaBox, to: ctx.cgContext)
        }

        let outPath = outDirURL.appendingPathComponent("page_\(i + 1).jpg").path
        let outURL = URL(fileURLWithPath: outPath)
        try? FileManager.default.removeItem(at: outURL)

        if let jpegData = image.jpegData(compressionQuality: jpegQuality) {
          try? jpegData.write(to: outURL)

          var fileSize: Int64 = 0
          if let attrs = try? FileManager.default.attributesOfItem(atPath: outPath) {
            fileSize = attrs[.size] as? Int64 ?? 0
          }

          paths.append(outPath)
          sizes.append(fileSize)
        }
      }

      promise.resolve([
        "paths": paths,
        "sizes": sizes,
        "pageCount": totalPages
      ])
    }
  }
}
