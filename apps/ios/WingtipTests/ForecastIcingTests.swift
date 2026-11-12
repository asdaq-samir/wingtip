import Foundation
import Testing
@testable import Wingtip

/// The Brief's forecast icing: the question /api/icing/route is asked
/// (the web's useIcingForecast) and each leg's row in words.
@MainActor
struct ForecastIcingTests {
    private func briefing(legsFrom: String, fixes: Int) throws -> Briefing {
        let points = (0..<fixes).map { #"{"lat":46.8\#($0),"lon":-92.1\#($0)}"# }.joined(separator: ",")
        let json = #"{"airports":{},"forecast":{"stations":[]},"hazards":[],"metars":{},"weather_unavailable":[],"legs_from":"\#(legsFrom)","leg_fixes":[\#(points)]}"#
        return try Planner.json.decode(Briefing.self, from: Data(json.utf8))
    }

    private let legs = [
        Leg.preview(from: "KDLH", to: "KHIB", distanceNm: 62.4, altitudeFt: 6500, trueCourseDeg: 318, magneticHeadingDeg: 315, eteMin: 36.04, groundMin: 0),
        Leg.preview(from: "KHIB", to: "KGPZ", distanceNm: 31.8, altitudeFt: 5500, trueCourseDeg: 296, magneticHeadingDeg: 293, eteMin: 18, groundMin: 30),
    ]

    @Test func askedOnlyWithTheNavLogsFixesAndEveryLegsTime() throws {
        let query = try #require(ForecastIcing.query(briefing: try briefing(legsFrom: "navlog", fixes: 3), legs: legs))
        #expect(query.fixes == "46.80000,-92.10000;46.81000,-92.11000;46.82000,-92.12000")
        #expect(query.altFt == "6500,5500" && query.legMin == "36.0,18.0" && query.groundMin == "0,30")
        // The route as entered, or a fix short: not asked.
        #expect(ForecastIcing.query(briefing: try briefing(legsFrom: "route", fixes: 3), legs: legs) == nil)
        #expect(ForecastIcing.query(briefing: try briefing(legsFrom: "navlog", fixes: 2), legs: legs) == nil)
        var untimed = legs
        untimed[1].eteMin = nil
        #expect(ForecastIcing.query(briefing: try briefing(legsFrom: "navlog", fixes: 3), legs: untimed) == nil)
    }

    @Test func eachLegInWords() throws {
        let json = #"{"issued":"2026-11-09T15:00:00Z","unchecked":[],"legs":[{"index":0,"altitude_ft":6500,"severity":"light","share":0.4,"layer":{"bottom_ft":4000,"top_ft":9000}},{"index":1,"altitude_ft":5500,"severity":"none"},{"index":2,"altitude_ft":5500,"severity":null}]}"#
        let answer = try Planner.json.decode(IcingForecastAnswer.self, from: Data(json.utf8))
        #expect(ForecastIcing.value(answer.legs[0]) == "Light at 6,500 ft, 40% of it")
        #expect(ForecastIcing.detail(answer.legs[0]) == "Icing forecast 4,000–9,000 ft")
        #expect(ForecastIcing.value(answer.legs[1]) == "None at 5,500 ft" && !ForecastIcing.iced(answer.legs[1]))
        #expect(ForecastIcing.detail(answer.legs[1]) == "No icing forecast over the leg")
        #expect(ForecastIcing.value(answer.legs[2]) == "No forecast at 5,500 ft" && ForecastIcing.detail(answer.legs[2]) == nil)
    }
}
