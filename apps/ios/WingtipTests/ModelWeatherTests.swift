import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import Wingtip

/// The model weather's pictures read and coloured as the web's
/// weatherlayers-gl reads and colours them (features/weather-flow): a
/// channel's 0 to 255 as its field's unscale range, alpha 0 as no value,
/// the wind's parts into its speed and where it blows from, a value
/// between pixels mixed between them, and the ramps from the engine's
/// bands (model_weather_bands, aviation_grid_bands).
@MainActor
@Suite struct ModelWeatherTests {
    private static let box = [-1.0, -1.0, 1.0, 1.0]

    /// A 2 x 2 picture: red values, the last pixel with no value.
    private func scalar(_ reds: [UInt8], alpha: [UInt8] = [255, 255, 255, 0]) -> FlowGrid {
        var bytes: [UInt8] = []
        for (r, a) in zip(reds, alpha) { bytes += [r, r, 0, a] }
        return FlowGrid(rgba: bytes, width: 2, height: 2, unscale: [0, 75], vector: false, bounds: Self.box)
    }

    @Test func aChannelIsItsFieldsUnscaleRange() {
        let grid = scalar([0, 255, 102, 9])
        #expect(grid.values[0] == 0)
        #expect(grid.values[1] == 75)
        #expect(abs(Double(grid.values[2]!) - 30) < 1e-4)
        #expect(grid.values[3] == nil)
    }

    @Test func aPixelsValueStandsAtItsMiddle() {
        let grid = scalar([0, 255, 102, 9], alpha: [255, 255, 255, 255])
        // The north-west pixel's middle is at (-0.5, 0.5).
        #expect(abs(grid.value(lat: 0.5, lon: -0.5)! - 0) < 1e-6)
        #expect(abs(grid.value(lat: 0.5, lon: 0.5)! - 75) < 1e-6)
        // Half way between the two north pixels.
        #expect(abs(grid.value(lat: 0.5, lon: 0)! - 37.5) < 1e-6)
        #expect(grid.value(lat: 0, lon: 5) == nil)
    }

    @Test func aMissingNeighbourGivesTheNearest() {
        let grid = scalar([0, 255, 102, 9])
        // Next to the south-east pixel, which has none: the nearest's.
        #expect(abs(grid.value(lat: -0.4, lon: -0.4)! - 30) < 1e-4)
    }

    @Test func theWindsPartsAreItsSpeedAndWhereItBlowsFrom() {
        // East part 0 kt (red 127.5 of -100..100 is near 0), north part +40 kt.
        let green = UInt8(((40.0 + 100) / 200 * 255).rounded())
        let east = UInt8(((0.0 + 100) / 200 * 255).rounded())
        let bytes = [east, green, 0, 255].repeated(4)
        let grid = FlowGrid(rgba: bytes, width: 2, height: 2, unscale: [-100, 100], vector: true, bounds: Self.box)
        let speed = grid.value(lat: 0, lon: 0)!
        #expect(abs(speed - 40) < 1)
        // Blowing toward the north is a wind from the south.
        let from = grid.fromDeg(lat: 0, lon: 0)!
        #expect(abs(from - 180) < 2)
    }

    @Test func thePlannersPNGIsReadAsItsBytes() throws {
        let bytes: [UInt8] = [0, 0, 0, 255, 255, 255, 0, 255, 102, 102, 0, 255, 9, 9, 0, 0]
        let png = try Self.png(bytes, width: 2, height: 2)
        let grid = try #require(FlowGrid.decode(png: png, field: APIFlowField(unit: "dBZ", unscale: [0, 75], vector: false), bounds: Self.box))
        #expect(grid.values[1] == 75)
        #expect(abs(Double(grid.values[2]!) - 30) < 1e-4)
        #expect(grid.values[3] == nil)
    }

    @Test func aRampMixesBetweenItsStopsAndHoldsItsEnds() {
        let ramp = FlowRamp(stops: [.init(at: 0, red: 0, green: 0, blue: 0, alpha: 0), .init(at: 10, red: 200, green: 100, blue: 50, alpha: 250)])
        #expect(ramp.colour(at: -5) == (0, 0, 0, 0))
        #expect(ramp.colour(at: 5) == (100, 50, 25, 125))
        #expect(ramp.colour(at: 20) == (200, 100, 50, 250))
    }

    @Test func thePrecipitationIsClearUnderTheEnginesLeast() throws {
        let bands = try Engine.modelWeatherBands()
        let look = try #require(FlowLooks.looks(bands, try Engine.aviationGridBands())[.precip])
        #expect(look.ramp.colour(at: bands.precip.leastDbz - 1).3 == 0)
        #expect(look.ramp.colour(at: bands.precip.leastDbz).3 > 0)
        // A legend word for each of the engine's bands.
        #expect(look.ticks.map(\.label) == bands.precip.bands.map(\.word))
    }

    @Test func theCeilingFadesOutOverTwiceVfrsFloor() throws {
        let bands = try Engine.modelWeatherBands()
        let look = try #require(FlowLooks.looks(bands, try Engine.aviationGridBands())[.ceiling])
        let vfr = try #require(bands.ceiling.last?.from)
        #expect(look.ramp.colour(at: 0).3 > 0)
        #expect(look.ramp.colour(at: vfr * 2 + 100).3 == 0)
        #expect(look.ticks.count == bands.ceiling.count)
    }

    @Test func icingIsClearWhereThereIsNone() throws {
        let grid = try Engine.aviationGridBands()
        let look = try #require(FlowLooks.looks(try Engine.modelWeatherBands(), grid)[.icing])
        #expect(look.ramp.colour(at: 0).3 == 0)
        #expect(look.ramp.colour(at: 4).3 > 0)
    }

    @Test func aPaintedPictureLeavesNoValueClearAndStandsNorthUp() {
        let grid = scalar([255, 255, 0, 0])
        let ramp = FlowRamp(stops: [.init(at: 0, red: 0, green: 0, blue: 0, alpha: 0), .init(at: 75, red: 255, green: 0, blue: 0, alpha: 255)])
        let (bytes, width, height) = FlowPaint.pixels(grid, ramp: ramp)
        #expect(width == 2)
        #expect(height == 2 * FlowPaint.rowsPerGridRow)
        // The top row is the north's, red; the bottom the south's, clear.
        #expect(bytes[0] == 255 && bytes[3] == 255)
        #expect(bytes[(height - 1) * width * 4 + 3] == 0)
    }

    @Test func theWindBetweenPixelsIsItsPartsMixedNotItsSpeeds() {
        // 20 kt from the west in the west column, 20 kt from the east in
        // the east one: half way between, the parts cancel to calm (the
        // web's and Android's reading), where the speeds' mean said 20 kt.
        let toEast = UInt8(((20.0 + 100) / 200 * 255).rounded())
        let toWest = UInt8(((-20.0 + 100) / 200 * 255).rounded())
        let calm = UInt8(((0.0 + 100) / 200 * 255).rounded())
        let bytes = [toEast, calm, 0, 255, toWest, calm, 0, 255].repeated(2)
        let grid = FlowGrid(rgba: bytes, width: 2, height: 2, unscale: [-100, 100], vector: true, bounds: Self.box)
        #expect(abs(grid.value(lat: 0.5, lon: -0.5)! - 20) < 1)
        // Calm but for the 0.39 kt north part the eight bits give "calm".
        #expect(grid.value(lat: 0.5, lon: 0)! < 1)
    }

    @Test func theBadgeSaysTheCeilingsTopAsNone() throws {
        let reading = try FlowReading.of(.ceiling, value: 12_750, unit: "ft", top: 12_750)
        #expect(reading.figure == "None")
        #expect(try FlowReading.of(.ceiling, value: 1_020, unit: "ft", top: 12_750).figure == "1,000")
    }

    @Test func aFailedRuleIsNoReadingNeverNoHazard() throws {
        // The engine's nil is none: turbulence under light's band.
        #expect(try FlowReading.of(.turb, value: 0, unit: "", top: nil).figure == "None")
        // A rule that fails (a value the engine cannot be asked, here
        // not a number) throws, so the model shows no reading and its
        // problem, never "None" for turbulence, icing or precipitation.
        for field in [FlowFieldKind.turb, .icing, .precip] {
            #expect(throws: (any Error).self) { try FlowReading.of(field, value: .nan, unit: "", top: nil) }
        }
    }

    private static func png(_ bytes: [UInt8], width: Int, height: Int) throws -> Data {
        let provider = try #require(CGDataProvider(data: Data(bytes) as CFData))
        let image = try #require(CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
                                         provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
        let out = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        return out as Data
    }
}

extension Array {
    fileprivate func repeated(_ times: Int) -> [Element] { (0..<times).flatMap { _ in self } }
}
