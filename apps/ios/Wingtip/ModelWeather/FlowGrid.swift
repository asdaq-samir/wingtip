import CoreGraphics
import Foundation
import ImageIO

/// One frame's picture of a field (the weather service's app.flow_grid):
/// a latitude-longitude grid, north row first, the value in the red
/// channel (the wind's east part in red and its north part in green), a
/// 255th of its field's `unscale` range a step, and alpha 0 where the
/// model gave none. The picture's box, `bounds`, is its pixels' outer
/// edges [west, south, east, north] (FlowLayer.bounds). Reading it at a
/// point is the engine's (flow_cell, flow_sample), as the web's bubble and
/// pins ask it, so the same point reads the same on every app; the bands
/// and words are the engine's too (FlowLooks, FlowReading).
struct FlowGrid: Sendable {
    let width: Int
    let height: Int
    /// Each pixel's value for the painted picture (FlowPaint), row by row
    /// from the north, nil where there is none; the wind's is its speed.
    let values: [Float?]
    /// [west, south, east, north], degrees.
    let bounds: [Double]
    /// The picture's own bytes, RGBA, which the engine reads a point from.
    private let rgba: [UInt8]
    private let unscale: [Double]
    private let vector: Bool
    /// The ceiling's picture, which the engine reads rounded to its step,
    /// its top no ceiling (flow_sample's no_ceiling).
    private let ceiling: Bool

    /// The grid from a picture's RGBA bytes (4 a pixel, rows packed).
    init(rgba: [UInt8], width: Int, height: Int, unscale: [Double], vector: Bool, bounds: [Double], ceiling: Bool = false) {
        self.width = width
        self.height = height
        self.bounds = bounds
        self.rgba = rgba
        self.unscale = unscale
        self.vector = vector
        self.ceiling = ceiling
        let low = unscale.first ?? 0, high = unscale.count > 1 ? unscale[1] : 1
        let step = (high - low) / 255
        var values = [Float?](repeating: nil, count: width * height)
        for i in 0..<min(values.count, rgba.count / 4) where rgba[i * 4 + 3] > 0 {
            let red = Float(low + Double(rgba[i * 4]) * step)
            let green = Float(low + Double(rgba[i * 4 + 1]) * step)
            values[i] = vector ? (red * red + green * green).squareRoot() : red
        }
        self.values = values
    }

    /// The value at a point and, for the wind, where it blows from: the
    /// engine's flow_cell finds the four pixels round it and flow_sample
    /// reads between them. Nil off the picture or where a pixel it is read
    /// from has none; a rule that fails throws, so the caller says why
    /// rather than showing no hazard.
    func reading(lat: Double, lon: Double) throws -> EngineContract.FlowSampleAnswer? {
        guard let cell = try Engine.flowCell(bounds: bounds, width: width, height: height, lat: lat, lon: lon) else { return nil }
        let pixels = try cell.pixels.map { i in
            guard i >= 0, i * 4 + 3 < rgba.count else { throw OffThePicture(index: i) }
            return [Double(rgba[i * 4]), Double(rgba[i * 4 + 1]), Double(rgba[i * 4 + 3])]
        }
        return try Engine.flowSample(pixels: pixels, fx: cell.fx, fy: cell.fy, unscale: unscale, vector: vector, ceiling: ceiling)
    }

    /// A pixel the engine named that the picture's bytes do not hold (a
    /// picture shorter than its width and height say).
    struct OffThePicture: LocalizedError {
        let index: Int
        var errorDescription: String? { "the picture has no pixel \(index)" }
    }

    /// The grid from the PNG the planner serves, read straight from its
    /// bytes: drawn into a context it would be colour-managed, and the
    /// channels are numbers, not colours.
    static func decode(png: Data, field: APIFlowField, bounds: [Double], ceiling: Bool = false) -> FlowGrid? {
        guard let source = CGImageSourceCreateWithData(png as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let rgba = rgbaBytes(of: image)
        else { return nil }
        return FlowGrid(rgba: rgba, width: image.width, height: image.height, unscale: field.unscale, vector: field.vector, bounds: bounds, ceiling: ceiling)
    }

    /// A picture's pixels as RGBA bytes: its own bytes where ImageIO kept
    /// them as 8-bit RGBA (as PIL writes them), else drawn into a context
    /// in the picture's own colour space, which leaves them as they are.
    static func rgbaBytes(of image: CGImage) -> [UInt8]? {
        let w = image.width, h = image.height
        let info = image.alphaInfo
        let littleEndian = image.byteOrderInfo == .order32Little || image.byteOrderInfo == .order16Little
        if image.bitsPerComponent == 8, image.bitsPerPixel == 32, !littleEndian,
           info == .last || info == .premultipliedLast,
           let data = image.dataProvider?.data, let bytes = CFDataGetBytePtr(data) {
            var out = [UInt8](repeating: 0, count: w * h * 4)
            for row in 0..<h {
                for i in 0..<(w * 4) { out[row * w * 4 + i] = bytes[row * image.bytesPerRow + i] }
            }
            return out
        }
        var out = [UInt8](repeating: 0, count: w * h * 4)
        let space = image.colorSpace ?? CGColorSpaceCreateDeviceRGB()
        let drawn: Bool = out.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                          space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? out : nil
    }
}
