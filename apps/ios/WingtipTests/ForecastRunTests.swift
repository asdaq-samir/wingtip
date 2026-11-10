import Foundation
import Testing
@testable import Wingtip

/// The dry run played against the forecast: the ask made from the run,
/// and the answer's picks by the run's time, as the web's forecastRun.ts.
@MainActor
struct ForecastRunTests {
    static let a = CourseEnd(elevationFt: 700, ident: "KAAA", lat: 42.0, lon: -88.0, name: "A")
    static let s = CourseEnd(elevationFt: 800, ident: "KSSS", lat: 42.5, lon: -88.0, name: "S")
    static let b = CourseEnd(elevationFt: 900, ident: "KBBB", lat: 43.0, lon: -88.0, name: "B")
    static let course = Course(bearingDeg: 0, chartCycle: "", chartLayers: [], courseLine: [[42.0, -88.0], [43.0, -88.0]], departure: a,
                               destination: b, distanceNm: 60, maxZoom: 0, minZoom: 0, stops: [s])

    @Test func eachPointFliesToTheFirstRowNotYetReachedAndTheLastOncePastThem() {
        let rowT = [0.0, 600, 1800]
        #expect(ForecastPlay.row(rowT, at: 0) == 0)
        #expect(ForecastPlay.row(rowT, at: 1) == 1)
        #expect(ForecastPlay.row(rowT, at: 600) == 1)
        #expect(ForecastPlay.row(rowT, at: 601) == 2)
        #expect(ForecastPlay.row(rowT, at: 5000) == 2)
        #expect(ForecastPlay.row([], at: 10) == 0)
    }

    @Test func aLongRunIsThinnedToFourHundredItsLastKept() {
        let kept = ForecastPlay.thinned(Array(0..<1001))
        #expect(kept.count <= 400 && kept.first == 0 && kept.last == 1000)
        #expect(ForecastPlay.thinned(Array(0..<10)) == Array(0..<10))
        #expect(ForecastPlay.thinned([Int]()).isEmpty)
    }

    @Test func theAskIsTheRunFromItsStartWithItsFieldsRulesAndMinimums() throws {
        let points = (0...4).map { Replay.Point(t: Double($0) * 450, lat: 42 + Double($0) * 0.25, lon: -88, altFt: $0 == 0 ? nil : 4500) }
        let landings = [EngineContract.DryRunAnswerLandingsItem(ident: "KSSS", t: 900, nm: 30, fuel: 2),
                        EngineContract.DryRunAnswerLandingsItem(ident: "KBBB", t: 1800, nm: 60, fuel: 4)]
        let minimums = PersonalMinimums(ceilingFt: 3000, crosswindKt: 10, visibilitySm: nil, windKt: nil)
        let ask = ForecastPlay.ask(points: points, rowT: [0, 900, 1800], landings: landings, course: Self.course, start: 1_000_000,
                                   rules: .ifr, minimums: minimums)
        #expect(ask.track.map(\.t) == [1_000_000, 1_000_450, 1_000_900, 1_001_350, 1_001_800])
        #expect(ask.track.map(\.row) == [0, 1, 1, 2, 2])
        #expect(ask.track.first?.altFt == nil && ask.track.last?.altFt == 4500)
        let fields = try #require(ask.fields)
        #expect(fields.map(\.role) == ["departure", "stop", "destination"])
        #expect(fields.map(\.ident) == ["KAAA", "KSSS", "KBBB"])
        #expect(fields.map(\.t) == [1_000_000, 1_000_900, 1_001_800])
        #expect(fields[1].lat == 42.5)
        #expect(ask.rules == "IFR" && ask.minimums == APIRunMinimums(ceilingFt: 3000, visibilitySm: nil))
        // VFR where the plan is.
        #expect(ForecastPlay.ask(points: points, rowT: [], landings: [], course: Self.course, start: 0, rules: .vfr, minimums: minimums).rules == "VFR")
    }

    static let answer = APIForecastRun(
        alerts: [APIRunAlert(kind: "vfr_minimums", lat: 42.2, lon: -88, source: "14 CFR 91.155; TAF KSSS", t: 200, words: "Below VFR minimums"),
                 APIRunAlert(kind: "sigmet", lat: 42.6, lon: -88, source: "SIGMET 3E", t: 900, words: "In a SIGMET")],
        areas: [APIRunArea(coords: [[42, -88], [43, -88], [43, -87]], highFt: nil, kind: "sigmet", lowFt: nil, source: "SIGMET 3E",
                           validFrom: 500, validTo: 1000, words: "Convective"),
                APIRunArea(coords: [], highFt: 9000, kind: "outlook", lowFt: nil, source: "SPC", validFrom: nil, validTo: nil, words: "Marginal")],
        fields: [], legs: [APIRunLeg(category: "VFR", fromT: 0, row: 1, toT: 600, worstT: nil), APIRunLeg(category: "IFR", fromT: 600, row: 2, toT: 1800, worstT: 700)],
        samples: [APIRunSample(areas: [], category: "VFR", ceilingFt: nil, ceilingUnknown: false, lat: 45, lon: -93, source: "TAF KAAA", t: 0, visibilitySm: 6,
                               windDirTrueDeg: 270, windSpeedKt: 25),
                  APIRunSample(areas: [0], category: "IFR", ceilingFt: 800, ceilingUnknown: false, lat: 45, lon: -92.9, source: "TAF KSSS", t: 600, visibilitySm: 2.5,
                               windDirTrueDeg: nil, windSpeedKt: nil)],
        unavailable: ["gairmets", "winds"])

    @Test func theSampleIsTheOneLastPassed() {
        #expect(ForecastPlay.sample(Self.answer, at: -5)?.t == 0)
        #expect(ForecastPlay.sample(Self.answer, at: 599)?.t == 0)
        #expect(ForecastPlay.sample(Self.answer, at: 600)?.t == 600)
        #expect(ForecastPlay.sample(Self.answer, at: 9999)?.category == "IFR")
    }

    @Test func theAlertIsTheNewestReached() {
        #expect(ForecastPlay.alert(Self.answer, at: 199) == nil)
        #expect(ForecastPlay.alert(Self.answer, at: 200)?.kind == "vfr_minimums")
        #expect(ForecastPlay.alert(Self.answer, at: 1000)?.kind == "sigmet")
    }

    @Test func theAreasAreThoseInForceFromTheirStartToBeforeTheirEnd() {
        #expect(ForecastPlay.areas(Self.answer, at: 499).map(\.kind) == ["outlook"])
        #expect(ForecastPlay.areas(Self.answer, at: 500).map(\.kind) == ["sigmet", "outlook"])
        #expect(ForecastPlay.areas(Self.answer, at: 1000).map(\.kind) == ["outlook"])
        // An outline of fewer than three points is not drawn.
        #expect(ForecastRunMapLayer.overlays(Self.answer.areas).map(\.kind) == ["sigmet"])
    }

    @Test func theStripsWords() {
        #expect(ForecastPlay.hourZ(14 * 3600 + 59 * 60) == "14Z")
        #expect(ForecastPlay.unavailable([]) == nil)
        #expect(ForecastPlay.unavailable(["gairmets", "winds"]) == "Played without G-AIRMETs, the winds aloft.")
        let line = ForecastPlay.line(Self.answer.samples[1])
        #expect(line.hasPrefix("IFR · ceiling 800 ft AGL · visibility 2.5 sm"))
        // A wind not known is never said to be calm.
        #expect(line.hasSuffix("wind aloft not known"))
        #expect(ForecastPlay.line(Self.answer.samples[0]).contains("no ceiling"))
    }

    @Test func theDryRunKeepsWhatTheAskIsMadeFrom() {
        let a = CourseEnd(elevationFt: 700, ident: "A", lat: 42.0, lon: -88.0, name: "A")
        let b = CourseEnd(elevationFt: 700, ident: "B", lat: 43.0, lon: -88.0, name: "B")
        let course = Course(bearingDeg: 0, chartCycle: "", chartLayers: [], courseLine: [[42.0, -88.0], [43.0, -88.0]], departure: a, destination: b,
                            distanceNm: 60, maxZoom: 0, minZoom: 0)
        let leg = Leg.preview(from: "A", to: "B", distanceNm: 60, altitudeFt: 4500, trueCourseDeg: 0, magneticHeadingDeg: 0, groundspeedKt: 120,
                              eteMin: 30, fuelGal: 4, tasKt: 110)
        let run = DryRun()
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        run.start(course: course, checkpoints: [], legs: [leg], at: start)
        #expect(run.startedAt == start && run.course == course && run.rowT.count == 2)
        #expect(run.landings.last?.ident == "B" && abs((run.landings.last?.t ?? 0) - 1800) < 1)
        run.stop()
        #expect(run.startedAt == nil && run.rowT.isEmpty && run.landings.isEmpty)
    }

    @Test func offForgetsTheAnswer() {
        let run = ForecastRun()
        run.on = true
        run.on = false
        #expect(run.answer == nil && run.problem == nil && !run.loading && run.areas.isEmpty)
    }
}
