import AppKit
import Foundation
import Vision

struct OCRLine: Codable {
    let text: String
    let confidence: Double
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let centerX: Double
    let centerY: Double
}

struct OCRResult: Codable {
    let imageWidth: Int
    let imageHeight: Int
    let lines: [OCRLine]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    fail("usage: /tmp/ocr_text <image.png>")
}

let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath) else {
    fail("failed to load image: \(imagePath)")
}
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cgImage = bitmap.cgImage else {
    fail("failed to decode image: \(imagePath)")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.minimumTextHeight = 0.015

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fail("vision request failed: \(error.localizedDescription)")
}

let imgW = cgImage.width
let imgH = cgImage.height
let observations = (request.results as? [VNRecognizedTextObservation]) ?? []

let lines = observations.compactMap { observation -> OCRLine? in
    guard let candidate = observation.topCandidates(1).first else {
        return nil
    }
    let box = observation.boundingBox
    let x = box.origin.x * Double(imgW)
    let width = box.size.width * Double(imgW)
    let height = box.size.height * Double(imgH)
    let y = (1.0 - box.origin.y - box.size.height) * Double(imgH)
    return OCRLine(
        text: candidate.string,
        confidence: Double(candidate.confidence),
        x: x,
        y: y,
        width: width,
        height: height,
        centerX: x + width / 2,
        centerY: y + height / 2
    )
}.sorted { lhs, rhs in
    if abs(lhs.centerY - rhs.centerY) < 10 {
        return lhs.centerX < rhs.centerX
    }
    return lhs.centerY < rhs.centerY
}

let result = OCRResult(imageWidth: imgW, imageHeight: imgH, lines: lines)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(result)
FileHandle.standardOutput.write(data)
