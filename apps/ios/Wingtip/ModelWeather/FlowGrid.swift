import CoreGraphics
import Foundation
import ImageIO

/// One frame's picture of a field as values (the weather service's
/// app.flow_grid): a latitude-longitude grid, north row first, the value
/// in the red channel (the wind's east part in red and its north part in
/// green), a 255th of its field's `unscale` range a step, and alpha 0
/// where the model gave none. The picture's box, `bounds`, is its pixels'
/// outer edges [west, south, east, north] (FlowLayer.bounds), so each
/// pixel's value stands at its middle. The web reads the same pictures
/// with weatherlayers-gl (features/weather-flow/flowTexture); this is its
/// reading on the phone, with no rule in it: the bands and words are the
/// engine's (FlowLooks, FlowReading).
struct FlowGrid: Sendable {
    let width: Int
    let height: Int
    /// The values, row by row from the north, nil where there is none.
    /// For the wind each is the speed, kt; `east` and `north` keep its
    /// parts, nil where there is none, which a point is read from.
    let values: [Float?]
    let east: [Float?]?
    let north: [Float?]?
    /// [west, south, east, north], degrees.
    let bounds: [Double]

    /// The grid from a picture's RGBA bytes (4 a pixel, rows packed).
    init(rgba: [UInt8], width: Int, height: Int, unscale: [Double], vector: Bool, bounds: [Double]) {
        self.width = width
        self.height = height
        self.bounds = bounds
        let low = unscale.first ?? 0, high = unscale.count > 1 ? unscale[1] : 1
        let step = (high - low) / 255
        let count = width * height
        var values = [Float?](repeating: nil, count: count)
        var east: [Float?]? = vector ? [Float?](repeating: nil, count: count) : nil
        var north: [Float?]? = vector ? [Float?](repeating: nil, count: count) : nil
        for i in 0..<min(count, rgba.count / 4) {
            guard rgba[i * 4 + 3] > 0 else { continue }
            let red = Float(low + Double(rgba[i * 4]) * step)
            if vector {
                let green = Float(low + Double(rgba[i * 4 + 1]) * step)
                east?[i] = red
                north?[i] = green
                values[i] = (red * red + green * green).squareRoot()
            } else {
                values[i] = red
            }
        }
        self.values = values
        self.east = east
        self.north = north
    }

    /// The grid from the PNG the planner serves, read straight from its
    /// bytes: drawn into a context it would be colour-managed, and the
    /// channels are numbers, not colours.
    static func decode(png: Data, field: APIFlowField, bounds: [Double]) -> FlowGrid? {
        guard let source = CGImageSourceCreateWithData(png as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let rgba = rgbaBytes(of: image)
        else { return nil }
        return FlowGrid(rgba: rgba, width: image.width, height: image.height, unscale: field.unscale, vector: field.vector, bounds: bounds)
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

    /// The pixel's place for a point, fractional, its middle at .5.
    private func place(lat: Double, lon: Double) -> (x: Double, y: Double)? {
        guard bounds.count == 4, bounds[2] > bounds[0], bounds[3] > bounds[1] else { return nil }
        let x = (lon - bounds[0]) / (bounds[2] - bounds[0]) * Double(width) - 0.5
        let y = (bounds[3] - lat) / (bounds[3] - bounds[1]) * Double(height) - 0.5
        guard x > -0.5, y > -0.5, x < Double(width) - 0.5, y < Double(height) - 0.5 else { return nil }
        return (x, y)
    }

    /// The value at a point, between the four pixels round it as the web's
    /// reading has it (weatherlayers-gl's linear interpolation), the
    /// nearest where one of them has none; nil outside the grid. The
    /// wind's speed is that of its parts read there, as the web and
    /// Android read it: the four speeds' mean would be too fast where the
    /// wind turns between pixels (two 20 kt winds from opposite sides are
    /// calm between them, not 20 kt).
    func value(lat: Double, lon: Double) -> Double? {
        guard let parts = parts(lat: lat, lon: lon) else { return sample(values, lat: lat, lon: lon) }
        return (parts.u * parts.u + parts.v * parts.v).squareRoot()
    }

    /// The wind's east and north parts at a point, kt; nil for a field
    /// with none, or off the grid.
    private func parts(lat: Double, lon: Double) -> (u: Double, v: Double)? {
        guard let east, let north,
              let u = sample(east, lat: lat, lon: lon),
              let v = sample(north, lat: lat, lon: lon)
        else { return nil }
        return (u, v)
    }

    /// Where the wind blows from, degrees true, at a point: its parts read
    /// as the speed is, turned round.
    func fromDeg(lat: Double, lon: Double) -> Double? {
        guard let (u, v) = parts(lat: lat, lon: lon), u != 0 || v != 0 else { return nil }
        let toward = atan2(u, v) * 180 / .pi
        return (toward + 180).truncatingRemainder(dividingBy: 360)
    }

    private func sample(_ grid: [Float?], lat: Double, lon: Double) -> Double? {
        guard let (x, y) = place(lat: lat, lon: lon) else { return nil }
        let x0 = max(0, min(width - 1, Int(floor(x)))), y0 = max(0, min(height - 1, Int(floor(y))))
        let x1 = min(width - 1, x0 + 1), y1 = min(height - 1, y0 + 1)
        let fx = max(0, min(1, x - Double(x0))), fy = max(0, min(1, y - Double(y0)))
        let corners = [grid[y0 * width + x0], grid[y0 * width + x1], grid[y1 * width + x0], grid[y1 * width + x1]]
        if let a = corners[0], let b = corners[1], let c = corners[2], let d = corners[3] {
            let top = Double(a) * (1 - fx) + Double(b) * fx
            let bottom = Double(c) * (1 - fx) + Double(d) * fx
            return top * (1 - fy) + bottom * fy
        }
        let nearest = grid[Int(y.rounded()).clamped(0, height - 1) * width + Int(x.rounded()).clamped(0, width - 1)]
        return nearest.map(Double.init)
    }
}

extension Int {
    fileprivate func clamped(_ low: Int, _ high: Int) -> Int { Swift.max(low, Swift.min(high, self)) }
}
