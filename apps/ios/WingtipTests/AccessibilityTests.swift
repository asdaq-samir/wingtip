import Foundation
import Testing
@testable import Wingtip

/// What VoiceOver says for the figures and rows the accessibility pass
/// labelled: the words, not the written forms, so "FL-045" and "1h 5m"
/// are never read out as letters.
@MainActor
struct AccessibilityTests {
    /// A nav log row is one element read as the leg's line: its number,
    /// its ends, then the heading and figures in words.
    @Test func aLegIsReadAsOneLine() {
        let leg = Leg.preview(from: "KDPA", to: "KRFD", distanceNm: 42, trueCourseDeg: 346, magneticHeadingDeg: 346,
                              groundspeedKt: 98, eteMin: 18, fuelGal: 1.4,
                              wind: APIWind(windDirTrueDeg: 270, windSpeedKt: 12))
        #expect(LegRow.spoken(leg, number: 2) ==
            "Leg 2, KDPA to KRFD, heading three four six degrees magnetic, ground speed ninety-eight knots, "
            + "wind two seven zero degrees true at twelve knots, forty-two nautical miles, eighteen minutes, one point four gallons")
    }

    /// With no airplane there is no heading, only the course, and no
    /// figure the airplane would give.
    @Test func aLegWithNoAirplaneIsReadByItsCourse() {
        var bare = Leg.preview(from: "A", to: "B", distanceNm: 1, trueCourseDeg: 0, magneticHeadingDeg: 0)
        bare.magneticHeadingDeg = nil
        #expect(LegRow.spoken(bare, number: nil) == "A to B, course three six zero degrees magnetic, one nautical mile")
    }

    @Test func theHeadLineIsReadInWords() {
        #expect(StripData.spokenHeadLine(dep: "C81", dest: "KDLH", stops: ["KJVL"], airplane: "C172", cruiseFt: 4500, departAt: nil)
            == "C81 to KJVL to KDLH, C172, four thousand five hundred feet, leaving now")
        #expect(StripData.spokenFigures(eteMin: 65, fuelGal: 12) == "one hour five minutes, twelve gallons")
        #expect(StripData.spokenFigures(eteMin: nil, fuelGal: nil) == "")
    }

    /// The map's rotor steps through the marks and stops at either end.
    @Test func theRotorStepsThroughTheMarks() {
        #expect(MapRotors.step(from: nil, count: 3, forward: true) == 0)
        #expect(MapRotors.step(from: nil, count: 3, forward: false) == 2)
        #expect(MapRotors.step(from: 1, count: 3, forward: true) == 2)
        #expect(MapRotors.step(from: 2, count: 3, forward: true) == nil)
        #expect(MapRotors.step(from: 0, count: 3, forward: false) == nil)
        #expect(MapRotors.step(from: nil, count: 0, forward: true) == nil)
    }

    /// The figures VoiceOver read through SpokenFigures are Format's words,
    /// whatever the OS's own spelling: no "forty five", no "and".
    @Test func spokenFiguresAreFormatsWords() {
        #expect(SpokenFigures.number(45) == "forty-five")
        #expect(SpokenFigures.feet(1_250) == "one thousand two hundred fifty feet")
        #expect(SpokenFigures.degrees(0) == "three six zero degrees")
        #expect(SpokenFigures.minutes(65) == "one hour five minutes")
        #expect(SpokenFigures.nauticalMiles(24) == "twenty-four nautical miles")
    }
}
