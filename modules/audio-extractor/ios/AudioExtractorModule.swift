import ExpoModulesCore
import AVFoundation

public class AudioExtractorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioExtractor")

    // extractAudio(inputPath, outputPath) -> { path: String, size: Int }
    AsyncFunction("extractAudio") { (inputPath: String, outputPath: String, promise: Promise) in
      self.performExtraction(inputPath: inputPath, outputPath: outputPath, promise: promise)
    }

    AsyncFunction("amplifyAudio") { (inputPath: String, outputPath: String, gain: Double, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        self.processAudio(inputPath: inputPath, outputPath: outputPath, gain: Float(gain), fadeInDuration: 0, fadeOutDuration: 0, promise: promise)
      }
    }

    AsyncFunction("fadeAudio") { (inputPath: String, outputPath: String, gain: Double, fadeInDuration: Double, fadeOutDuration: Double, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        self.processAudio(inputPath: inputPath, outputPath: outputPath, gain: Float(gain), fadeInDuration: fadeInDuration, fadeOutDuration: fadeOutDuration, promise: promise)
      }
    }
  }

  private func processAudio(inputPath: String, outputPath: String, gain: Float, fadeInDuration: Double, fadeOutDuration: Double, promise: Promise) {
    let cleanInput = inputPath.hasPrefix("file://") ? String(inputPath.dropFirst(7)) : inputPath
    let wavOutputPath = (outputPath as NSString).deletingPathExtension + ".wav"
    let inputURL = URL(fileURLWithPath: cleanInput)
    let outputURL = URL(fileURLWithPath: wavOutputPath)

    try? FileManager.default.removeItem(at: outputURL)

    do {
      let audioFile = try AVAudioFile(forReading: inputURL)
      let format = audioFile.processingFormat
      let frameCount = AVAudioFrameCount(audioFile.length)

      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
        promise.reject("ERR_BUFFER", "Could not create audio buffer")
        return
      }

      try audioFile.read(into: buffer)
      buffer.frameLength = frameCount

      let sampleRate = format.sampleRate
      let channelCount = Int(format.channelCount)
      let totalFrames = Int(frameCount)

      let fadeInFrames = min(Int(fadeInDuration * sampleRate), totalFrames)
      let fadeOutFrames = min(Int(fadeOutDuration * sampleRate), totalFrames)
      let fadeOutStart = totalFrames - fadeOutFrames

      for ch in 0 ..< channelCount {
        guard let data = buffer.floatChannelData?[ch] else { continue }
        for frame in 0 ..< totalFrames {
          var multiplier = gain
          if fadeInFrames > 0 && frame < fadeInFrames {
            multiplier *= Float(frame) / Float(fadeInFrames)
          }
          if fadeOutFrames > 0 && frame >= fadeOutStart {
            let pos = frame - fadeOutStart
            multiplier *= 1.0 - Float(pos) / Float(fadeOutFrames)
          }
          data[frame] *= multiplier
        }
      }

      let wavSettings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatLinearPCM),
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channelCount,
        AVLinearPCMBitDepthKey: 32,
        AVLinearPCMIsFloatKey: true,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false
      ]

      let outputFile = try AVAudioFile(forWriting: outputURL, settings: wavSettings)
      try outputFile.write(from: buffer)

      let attrs = try FileManager.default.attributesOfItem(atPath: wavOutputPath)
      let fileSize = attrs[.size] as? Int64 ?? 0
      promise.resolve(["path": wavOutputPath, "size": fileSize])
    } catch {
      promise.reject("ERR_PROCESS", "Audio processing failed: \(error.localizedDescription)")
    }
  }

  private func performExtraction(inputPath: String, outputPath: String, promise: Promise) {
    // Build URL from the input path (raw file path, no file:// prefix)
    let inputURL = URL(fileURLWithPath: inputPath)
    let outputURL = URL(fileURLWithPath: outputPath)

    // Remove existing output file if any
    try? FileManager.default.removeItem(at: outputURL)

    // Ensure parent directory exists
    let parentDir = outputURL.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

    let asset = AVURLAsset(url: inputURL)
    let audioTracks = asset.tracks(withMediaType: .audio)

    guard !audioTracks.isEmpty else {
      promise.reject("ERR_NO_AUDIO", "No audio track found in the video")
      return
    }

    // Use AVAssetExportSession with AppleM4A preset to extract audio natively
    guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
      promise.reject("ERR_EXPORT_SESSION", "Could not create AVAssetExportSession")
      return
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .m4a

    exportSession.exportAsynchronously {
      switch exportSession.status {
      case .completed:
        do {
          let attrs = try FileManager.default.attributesOfItem(atPath: outputPath)
          let fileSize = attrs[.size] as? Int64 ?? 0
          promise.resolve([
            "path": outputPath,
            "size": fileSize
          ])
        } catch {
          promise.resolve([
            "path": outputPath,
            "size": 0
          ])
        }
      case .failed:
        let errorMsg = exportSession.error?.localizedDescription ?? "Unknown error"
        promise.reject("ERR_EXTRACTION", "Audio extraction failed: \(errorMsg)")
      case .cancelled:
        promise.reject("ERR_CANCELLED", "Audio extraction was cancelled")
      default:
        promise.reject("ERR_UNKNOWN", "Unknown export status")
      }
    }
  }
}
