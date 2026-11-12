import CoreGraphics
import Foundation
import UIKit

/// A field's colour ramp, low to high, as the web's flowLook gives it to
/// weatherlayers-gl's palette: each stop a value in the field's unit and a
/// colour with its strength in 255ths, a value between two stops mixed
/// between them, one past the ends held at the end's (a ramp that clears
/// at an end, as the precipitation's under its least does, so stays clear).
struct FlowRamp: Equatable, Sendable {
    struct Stop: Equatable, Sendable {
        var at: Double
        var red: UInt8, green: UInt8, blue: UInt8, alpha: UInt8
    }

    var stops: [Stop]

    /// A stop of a token's colour at a strength in 255ths.
    static func stop(_ at: Double, _ colour: UIColor, _ alpha: UInt8) -> Stop {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.getRed(&r, green: &g, blue: &b, alpha: &a)
        let byte = { (c: CGFloat) in UInt8(max(0, min(255, (c * 255).rounded()))) }
        return Stop(at: at, red: byte(r), green: byte(g), blue: byte(b), alpha: alpha)
    }

    /// The colour at a value, RGBA bytes, not premultiplied.
    func colour(at value: Double) -> (UInt8, UInt8, UInt8, UInt8) {
        guard let first = stops.first, let last = stops.last else { return (0, 0, 0, 0) }
        if value <= first.at { return (first.red, first.green, first.blue, first.alpha) }
        if value >= last.at { return (last.red, last.green, last.blue, last.alpha) }
        guard let upper = stops.firstIndex(where: { $0.at >= value }), upper > 0 else { return (last.red, last.green, last.blue, last.alpha) }
        let a = stops[upper - 1], b = stops[upper]
        let t = b.at > a.at ? (value - a.at) / (b.at - a.at) : 0
        let mix = { (x: UInt8, y: UInt8) in UInt8((Double(x) * (1 - t) + Double(y) * t).rounded()) }
        return (mix(a.red, b.red), mix(a.green, b.green), mix(a.blue, b.blue), mix(a.alpha, b.alpha))
    }

    /// The ramp's lowest and highest values, for the legend's bar.
    var span: ClosedRange<Double> {
        let low = stops.first?.at ?? 0, high = stops.last?.at ?? 1
        return low...max(high, low + 1e-9)
    }
}

/// A grid painted for the map: its values coloured by a ramp into a
/// picture in MapKit's web Mercator, so it is drawn straight into the
/// overlay's box (ModelWeatherOverlay) with no stretch north of the
/// equator. The grid's rows are evenly spaced in latitude; each row of the
/// picture takes the grid's row at its latitude. MapKit's own world ends
/// at the antimeridian and about 85 degrees, so the box is held inside them.
enum FlowPaint {
    /// Rows of the picture for each of the grid's: Mercator stretches the
    /// north, so a few more keep its rows from doubling.
    static let rowsPerGridRow = 2
    static let mercatorLimit = 85.0

    /// The box the picture covers, [west, south, east, north].
    static func box(of grid: FlowGrid) -> [Double] {
        guard grid.bounds.count == 4 else { return [0, 0, 0, 0] }
        return [max(-180, grid.bounds[0]), max(-mercatorLimit, grid.bounds[1]),
                min(180, grid.bounds[2]), min(mercatorLimit, grid.bounds[3])]
    }

    static func mercatorY(_ lat: Double) -> Double { log(tan(.pi / 4 + lat * .pi / 360)) }
    static func latitude(mercatorY y: Double) -> Double { atan(sinh(y)) * 180 / .pi }

    /// The picture's pixels, RGBA premultiplied, row by row from the north.
    static func pixels(_ grid: FlowGrid, ramp: FlowRamp) -> (bytes: [UInt8], width: Int, height: Int) {
        let box = box(of: grid)
        let b = grid.bounds
        let width = grid.width, height = grid.height * rowsPerGridRow
        guard b.count == 4, width > 0, height > 0, b[2] > b[0], b[3] > b[1] else { return ([], 0, 0) }
        let top = mercatorY(box[3]), bottom = mercatorY(box[1])
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        // Each column's grid column, worked out once.
        let columns: [Int] = (0..<width).map { i in
            let lon = box[0] + (Double(i) + 0.5) / Double(width) * (box[2] - box[0])
            let x = (lon - b[0]) / (b[2] - b[0]) * Double(grid.width) - 0.5
            return max(0, min(grid.width - 1, Int(x.rounded())))
        }
        for j in 0..<height {
            let lat = latitude(mercatorY: top - (Double(j) + 0.5) / Double(height) * (top - bottom))
            let y = (b[3] - lat) / (b[3] - b[1]) * Double(grid.height) - 0.5
            let row = max(0, min(grid.height - 1, Int(y.rounded())))
            for i in 0..<width {
                guard let value = grid.values[row * grid.width + columns[i]] else { continue }
                let (r, g, bl, a) = ramp.colour(at: Double(value))
                guard a > 0 else { continue }
                let o = (j * width + i) * 4
                let strength = Double(a) / 255
                bytes[o] = UInt8((Double(r) * strength).rounded())
                bytes[o + 1] = UInt8((Double(g) * strength).rounded())
                bytes[o + 2] = UInt8((Double(bl) * strength).rounded())
                bytes[o + 3] = a
            }
        }
        return (bytes, width, height)
    }

    /// The picture as a CGImage, for the renderer.
    static func image(_ grid: FlowGrid, ramp: FlowRamp) -> CGImage? {
        let (bytes, width, height) = pixels(grid, ramp: ramp)
        guard width > 0, height > 0 else { return nil }
        let data = Data(bytes) as CFData
        guard let provider = CGDataProvider(data: data) else { return nil }
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
