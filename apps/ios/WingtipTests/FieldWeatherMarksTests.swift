import Foundation
import Testing
@testable import Wingtip

/// The airport weather marks (the owner's pick, 2026-11-10) as the map
/// asks the engine for them through its call, against the shared fixture
/// the engine's, the web's and Android's tests read too
/// (apps/web/src/lib/fixtures/airportWeatherMarks.json): the barb drawn
/// zoomed out or not, red or not, its parts and calm, and the ↓ shown or not.
@MainActor
struct FieldWeatherMarksTests {
    private final class FixtureBundle {}

    private struct Fixture: Decodable {
        struct Arrow: Decodable {
            let why: String
            let input: EngineContract.WindArrowInput
            let answer: EngineContract.WindArrowAnswer
        }

        struct Barb: Decodable {
            let why: String
            let speedKt: Double
            let answer: EngineContract.WindBarbAnswer

            enum CodingKeys: String, CodingKey {
                case why, answer
                case speedKt = "speed_kt"
            }
        }

        struct Reading: Decodable {
            let ident: String
            let ceilingFt: Double?
            let visibilitySm: Double?

            enum CodingKeys: String, CodingKey {
                case ident
                case ceilingFt = "ceiling_ft"
                case visibilitySm = "visibility_sm"
            }

            var field: EngineContract.WorseField {
                .init(ident: ident, ceilingFt: ceilingFt, visibilitySm: visibilitySm, ceilingUnknown: nil, arrival: true)
            }
        }

        struct Worse: Decodable {
            let why: String
            let now: [Reading]
            let atEta: [Reading]
            let badged: [String]
        }

        let windArrow: [Arrow]
        let windBarb: [Barb]
        let worseByArrival: [Worse]
    }

    private func fixture() throws -> Fixture {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "airportWeatherMarks", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    @Test func theFarBarbShowsAndGoesRedAsTheEngineSays() throws {
        for example in try fixture().windArrow {
            let i = example.input
            let mark = FieldWeatherMarks.mark(.init(ident: "KJVL", category: "VFR", windDirTrueDeg: 220, windSpeedKt: i.speedKt, windGustKt: i.gustKt,
                                                    crosswindKt: i.crosswindKt),
                                              demonstratedKt: i.demonstratedKt, worse: false)
            #expect(mark.far == example.answer.shown, "\(example.why)")
            #expect(mark.over == example.answer.over, "\(example.why)")
        }
    }

    @Test func noAirplaneIsNeverRed() {
        let plan = Plan()
        #expect(FieldWeatherMarks.demonstratedKt(plan) == nil)
        let mark = FieldWeatherMarks.mark(.init(ident: "KJVL", windDirTrueDeg: 220, windSpeedKt: 18, windGustKt: 26, crosswindKt: 17),
                                          demonstratedKt: FieldWeatherMarks.demonstratedKt(plan), worse: false)
        #expect(mark.far && !mark.over)
    }

    @Test func theBarbIsTheEngines() throws {
        for example in try fixture().windBarb {
            let mark = FieldWeatherMarks.mark(.init(ident: "KJVL", windDirTrueDeg: 220, windSpeedKt: example.speedKt), demonstratedKt: nil, worse: false)
            #expect(mark.calm == example.answer.calm, "\(example.why)")
            #expect(mark.feathers == Feathers(flags: example.answer.flags, barbs: example.answer.barbs, halfBarbs: example.answer.halfBarbs), "\(example.why)")
        }
    }

    @Test func theBadgeShowsWhereTheTafIsWorseByArrival() throws {
        for example in try fixture().worseByArrival {
            let badged = FieldWeatherMarks.worse(now: example.now.map(\.field), atEta: example.atEta.map(\.field))
            #expect(badged == Set(example.badged), "\(example.why)")
        }
    }

    @Test func voiceOverSaysTheCategoryAndTheWind() {
        let mark = FieldWeatherMarks.mark(.init(ident: "KJVL", category: "IFR", windDirTrueDeg: 220, windSpeedKt: 18, windGustKt: 26),
                                          demonstratedKt: nil, worse: false)
        #expect(mark.spoken == "IFR, wind 220 at 18 gusting 26")
        // The gust is the card's; the barb is the wind's only mark.
        #expect(mark.variable == nil)
    }

    @Test func aVariableWindIsWrittenAsTheMetarWritesIt() {
        let mark = FieldWeatherMarks.mark(.init(ident: "KJVL", category: "VFR", windSpeedKt: 5), demonstratedKt: nil, worse: false)
        #expect(mark.variable == "VRB05" && !mark.calm)
        #expect(mark.spoken == "VFR, wind variable at 5")
        // Calm is no variable wind.
        let calm = FieldWeatherMarks.mark(.init(ident: "KJVL", windSpeedKt: 2), demonstratedKt: nil, worse: false)
        #expect(calm.calm && calm.variable == nil)
    }

    @Test func farBarbsStartAtARegionsScaleAndGrowIn() {
        #expect(FarBarb.scale(zoom: 5.9) == nil)
        #expect(FarBarb.scale(zoom: 6) == 0.6)
        #expect(FarBarb.scale(zoom: 7.5) == 0.8)
        #expect(FarBarb.scale(zoom: 9) == 1 && FarBarb.scale(zoom: 12) == 1)
    }

    @Test func theStationLinesAreTheReportsFigures() {
        #expect(FieldWeatherMarks.visibilityLine(2, wx: "BR") == "2 SM BR")
        #expect(FieldWeatherMarks.visibilityLine(0.5, wx: nil) == "0.5 SM")
        #expect(FieldWeatherMarks.ceilingLine(800, unknown: false) == "CIG 008")
        #expect(FieldWeatherMarks.ceilingLine(nil, unknown: true) == "CIG ///")
        #expect(FieldWeatherMarks.ceilingLine(nil, unknown: false) == nil)
        // The layer's own cover where the planner sends it (ceiling_cover).
        #expect(FieldWeatherMarks.ceilingLine(800, unknown: false, cover: "OVC") == "OVC 008")
        #expect(FieldWeatherMarks.ceilingLine(2500, unknown: false, cover: "BKN") == "BKN 025")
        #expect(FieldWeatherMarks.ceilingLine(200, unknown: false, cover: "VV") == "VV 002")
        #expect(FieldWeatherMarks.ceilingLine(nil, unknown: true, cover: "OVC") == "OVC ///")
        // A cover that makes no ceiling is not one; CIG stands.
        #expect(FieldWeatherMarks.ceilingLine(800, unknown: false, cover: "SCT") == "CIG 008")
    }

    @Test func theStationModelShowsCloseInOrAlways() {
        var choice = AirportWeatherChoice()
        #expect(choice.style == .halo && choice.stationClose && choice.windBarbs && choice.worse)
        #expect(!choice.station(zoom: 9) && choice.station(zoom: 10))
        choice.stationClose = false
        #expect(!choice.station(zoom: 12))
        choice.style = .station
        #expect(choice.station(zoom: 5))
        choice.style = .off
        #expect(!choice.station(zoom: 12))
    }

    @Test func aReportHeardOverAnHourAgoSaysItsAge() {
        let now = Date(timeIntervalSince1970: 1_762_700_000)
        let mark = FieldWeatherMark(category: "VFR", spoken: "VFR, wind calm")
        // Within the hour a routine METAR is made in: fresh, as it was.
        #expect(FieldWeatherMarks.aged(mark, heardAt: now.addingTimeInterval(-50 * 60), now: now) == mark)
        #expect(FieldWeatherMarks.aged(mark, heardAt: nil, now: now) == mark)
        let old = FieldWeatherMarks.aged(mark, heardAt: now.addingTimeInterval(-75 * 60), now: now)
        #expect(old.heardAgo == "1h 15m")
        #expect(old.spoken.contains("weather heard 1h 15m ago"))
    }
}
