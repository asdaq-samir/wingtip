import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import Wingtip

/// Terrain Hazards on the iPhone against the shared fixture the engine's
/// and the web's tests read too (apps/web/src/lib/fixtures/hazardView.json,
/// worked by hand from 14 CFR 91.119 and 91.177): the map's colouring as
/// TerrainHazard asks the engine, the side view's obstacles as
/// ProfileRules asks it, and the tiles' pixels coloured against the lines.
@MainActor
struct HazardTests {
    private final class FixtureBundle {}

    private struct Fixture: Decodable {
        struct Expected: Decodable {
            let shown: Bool?
            let inFlight: Bool?
            let altitudeFt: Double?
            let source: String?
            let clearanceFt: Double?
            let warningFromFt: Double?
            let cautionFromFt: Double?
            let levels: [String?]?

            enum CodingKeys: String, CodingKey {
                case shown, source, levels
                case inFlight = "in_flight"
                case altitudeFt = "altitude_ft"
                case clearanceFt = "clearance_ft"
                case warningFromFt = "warning_from_ft"
                case cautionFromFt = "caution_from_ft"
            }
        }

        struct View: Decodable {
            let why: String
            let input: EngineContract.HazardViewInput
            let expected: Expected
        }

        struct Obstacles: Decodable {
            let input: EngineContract.ProfileObstaclesInput
            let expected: [EngineContract.ProfileObstaclesAnswerItem]
        }

        let views: [View]
        let obstacles: Obstacles
    }

    private func fixture() throws -> Fixture {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "hazardView", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    @Test func theMapsColouringIsTheEnginesAsTheFixtureSays() throws {
        for example in try fixture().views {
            let i = example.input, e = example.expected
            let setting = try #require(TerrainHazard.Setting(rawValue: i.setting))
            let view = try TerrainHazard.view(setting: setting, clearanceFt: i.clearanceFt, speedKt: i.speedKt, gpsFt: i.gpsAltitudeFt,
                                              plannedFt: i.plannedAltitudeFt, topsFt: i.topsFt ?? [])
            if let shown = e.shown { #expect(view.shown == shown, "\(example.why)") }
            if let inFlight = e.inFlight { #expect(view.inFlight == inFlight, "\(example.why)") }
            if let altitude = e.altitudeFt { #expect(view.altitudeFt == altitude, "\(example.why)") }
            if let source = e.source { #expect(view.source == source, "\(example.why)") }
            if let clearance = e.clearanceFt { #expect(view.clearanceFt == clearance, "\(example.why)") }
            if let warning = e.warningFromFt { #expect(view.warningFromFt == warning, "\(example.why)") }
            if let caution = e.cautionFromFt { #expect(view.cautionFromFt == caution, "\(example.why)") }
            if let levels = e.levels { #expect(view.levels == levels, "\(example.why)") }
        }
    }

    @Test func theClearancesOfferedAreTheEnginesThree() throws {
        let figures = try TerrainHazard.clearances(picked: nil)
        #expect(figures.offered == [500, 1000, 2000] && figures.inUse == 1000)
        #expect(try TerrainHazard.clearances(picked: 2000).inUse == 2000)
    }

    @Test func theGPSHeightIsPassedIn50FtSteps() {
        #expect(TerrainHazard.stepped(5524) == 5500 && TerrainHazard.stepped(5526) == 5550 && TerrainHazard.stepped(nil) == nil)
    }

    @Test func theSideViewsObstaclesAreTheEnginesAsTheFixtureSays() throws {
        let example = try fixture().obstacles
        let profile = RouteProfile(airspace: [], lengthNm: example.input.lengthNm,
                                   obstacles: (example.input.obstacles ?? []).map { ProfileObstacle(aglFt: $0.aglFt, alongNm: $0.alongNm, amslFt: $0.amslFt) },
                                   terrain: [])
        #expect(try ProfileRules.obstacles(altitudeFt: example.input.altitudeFt, profile: profile) == example.expected)
        #expect(ProfileHazardMarks.name(example.expected[0]) == "2,500 (1,500)")
    }

    @Test func aPixelIsRedOverTheRedLineAndAmberFromTheAmber() {
        // At 5,500 ft with 1,000 ft kept: red over 4,500 ft, amber from 3,500 (the fixture's first view).
        let bands = HazardBands(warningFt: 4500, cautionFt: 3500)
        let (cautionM, warningM) = HazardPaint.metres(bands)
        #expect(abs(warningM - 1371.6) < 0.01 && abs(cautionM - 1066.8) < 0.01)
        #expect(HazardPaint.shade(warningM + 0.1, cautionM: cautionM, warningM: warningM) == .warning)
        #expect(HazardPaint.shade(warningM, cautionM: cautionM, warningM: warningM) == .caution, "exactly the clearance kept is amber")
        #expect(HazardPaint.shade(cautionM, cautionM: cautionM, warningM: warningM) == .caution)
        #expect(HazardPaint.shade(cautionM - 0.1, cautionM: cautionM, warningM: warningM) == .clear)
        let pixels = HazardPaint.pixels([0, 1200, 1400], bands: bands)
        #expect(Array(pixels[0..<4]) == [0, 0, 0, 0], "clear under the amber")
        #expect(pixels[7] == 128 && pixels[11] == 153, "amber half, red three fifths strong")
        #expect(pixels[8] > pixels[9], "red is red")
    }

    @Test func aTerrariumTileDecodesToItsHeights() throws {
        // 1,371 m is R 133, G 91, B 0: 133·256 + 91 − 32768 (terrarium).
        #expect(HazardPaint.metres(r: 133, g: 91, b: 0) == 1371)
        #expect(HazardPaint.metres(r: 128, g: 0, b: 128) == 0.5)
        var bytes: [UInt8] = [133, 91, 0, 255, 128, 0, 0, 255, 128, 0, 0, 255, 133, 91, 0, 255]
        let image = try #require(bytes.withUnsafeMutableBytes { raw in
            CGContext(data: raw.baseAddress, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 8,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)?.makeImage()
        })
        let png = NSMutableData()
        let sink = try #require(CGImageDestinationCreateWithData(png, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(sink, image, nil)
        #expect(CGImageDestinationFinalize(sink))
        let read = try #require(HazardPaint.heights(png: png as Data))
        #expect(read.side == 2 && read.metres == [1371, 0, 0, 1371])
    }

    @Test func theKeyNamesEachLinesSourceAndTime() throws {
        let weather = ProfileWeather(
            clouds: [.init(alongNm: 30, baseFt: 3800, issued: "2026-11-21T11:20:00Z", station: "KMID")],
            forTime: "2026-11-21T15:00:00Z",
            freezing: [.init(alongNm: 0, ft: 6500), .init(alongNm: 20, ft: 7000)],
            freezingSource: .init(label: "NOAA GFS", run: "2026-11-21T12:00:00Z", validAt: "2026-11-21T15:00:00Z"),
            icing: [.init(fromFreezingLevel: true, fromNm: 20, highFt: 12000, issued: "2026-11-21T14:45:00Z", toNm: 40,
                          validAt: "2026-11-21T15:00:00Z")],
            unavailable: ["clouds"])
        #expect(ProfileWeatherKey.lines(weather).map(\.words) == [
            "Ceiling 3,800 ft · KMID TAF 1120Z",
            "Freezing level from 6,500 ft · NOAA GFS 1200Z run, for 1500Z",
            "Icing FZL–12,000 ft · G-AIRMET for 1500Z, issued 1445Z",
            "Cloud bases not available",
        ])
        #expect(ProfileWeatherKey.lines(nil).isEmpty)
    }
}
