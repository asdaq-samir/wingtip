import Foundation
import Testing
@testable import Wingtip

private final class ApproachFixtureBundle {}

/// KBUR's ILS Y RWY 08 and RNAV (GPS) Z RWY 08 as the planner draws them
/// from the CIFP of 1 Oct 2026 (apps/web/src/lib/fixtures/approachKbur.json,
/// the fixture the web's and the engine's approach tests read), each as
/// the planner sends it.
private func kbur() throws -> [String: Any] {
    let url = try #require(Bundle(for: ApproachFixtureBundle.self).url(forResource: "approachKbur", withExtension: "json"))
    return try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
}

private func planned(_ id: String) throws -> Data {
    try JSONSerialization.data(withJSONObject: try #require(try kbur()[id]))
}

/// The procedure's final as a line to fly, 2 nm out before its first
/// point on the course into it (the web test's finalOf).
private func finalLine(_ id: String) throws -> [(lat: Double, lon: Double)] {
    let drawing = try #require(try kbur()[id] as? [String: Any])
    let lines = try #require(drawing["lines"] as? [[String: Any]])
    let final = try #require(lines.first { $0["role"] as? String == "final" }?["points"] as? [[Double]])
    let line = final.map { (lat: $0[0], lon: $0[1]) }
    let (a, b) = (line[0], line[1])
    let k = try 2 / nm(a, b)
    return [(lat: a.lat - (b.lat - a.lat) * k, lon: a.lon - (b.lon - a.lon) * k)] + line
}

/// The engine's distance, nm, on WGS-84 (distance_nm): where along the
/// line a point is, by the one measure every app asks.
private func nm(_ a: (lat: Double, lon: Double), _ b: (lat: Double, lon: Double)) throws -> Double {
    try Engine.distanceNm(lat1: a.lat, lon1: a.lon, lat2: b.lat, lon2: b.lon)
}

/// The line flown at 120 kt, a point a second, at `alt(toGo)` ft; then
/// `after` seconds on past its end at `afterAlt(s)`.
private func fly(_ line: [(lat: Double, lon: Double)], alt: (Double) -> Double, after: Int, afterAlt: (Int) -> Double) throws -> [EngineContract.TrackPoint] {
    let legs = try zip(line, line.dropFirst()).map { (a: $0, b: $1, nm: try nm($0, $1)) }
    let total = legs.reduce(0) { $0 + $1.nm }
    let t0 = 1_793_372_400_000.0
    var points: [EngineContract.TrackPoint] = []
    var s = 0.0
    while s * 120 / 3600 <= total {
        var rest = s * 120 / 3600
        var k = 0
        while k < legs.count - 1, rest > legs[k].nm { rest -= legs[k].nm; k += 1 }
        let leg = legs[k], f = min(rest / leg.nm, 1)
        let p = (lat: leg.a.lat + (leg.b.lat - leg.a.lat) * f, lon: leg.a.lon + (leg.b.lon - leg.a.lon) * f)
        points.append(EngineContract.TrackPoint(t: t0 + s * 1000, lat: p.lat, lon: p.lon, altFt: alt(total - s * 120 / 3600)))
        s += 1
    }
    let (a, b) = (line[line.count - 2], line[line.count - 1])
    let per = try 120.0 / 3600 / nm(a, b)
    for k in 1...after {
        let f = 1 + per * Double(k)
        points.append(EngineContract.TrackPoint(t: t0 + (s + Double(k) - 1) * 1000, lat: a.lat + (b.lat - a.lat) * f,
                                                lon: a.lon + (b.lon - a.lon) * f, altFt: afterAlt(k)))
    }
    return points
}

/// The coach's approaches from a saved track: the field's approaches as
/// the planner draws them, the one flown found by the engine's
/// approach_find, and its debrief trimmed to what proficiency_plan reads,
/// as the web's coachDebriefs.
struct CoachApproachesTests {
    /// The ILS flown as charted (the web test's onIls): 3,700 ft to SILEX,
    /// 3,000 to the glide slope, then down it -- 787 ft at the threshold
    /// and 3° (the drawing's runway_path) -- and a missed approach begun
    /// 12 s past the runway at 1,000 ft a minute.
    private func ilsFlown() throws -> [EngineContract.TrackPoint] {
        let gp = try #require(try CoachApproaches.drawing(planned("I08-Y")).runwayPath)
        let earthFt = 6_371_000 * 3.28084
        let glidepath = { (toGo: Double) in
            let d = toGo * 6076.12
            return gp.ft + d * tan(gp.deg * .pi / 180) + d * d / (2 * earthFt)
        }
        return try fly(try finalLine("I08-Y"), alt: { min(glidepath($0), $0 > 11 ? 3700 : 3000) }, after: 120,
                       afterAlt: { $0 <= 12 ? gp.ft : gp.ft + Double($0 - 12) * 1000 / 60 })
    }

    @Test func aProcedureAsThePlannerDrawsItIsReadAsTheEngineHasIt() throws {
        let d = try CoachApproaches.drawing(planned("I08-Y"))
        #expect(d.airport == "KBUR" && d.id == "I08-Y" && d.name == "ILS Y RWY 08")
        #expect(d.fixes?.contains { $0.ident == "SILEX" } == true)
    }

    @Test func theApproachFlownIsFoundAndTrimmedForTheCoach() throws {
        let drawings = try ["R08-Z", "I08-Y"].map { try CoachApproaches.drawing(planned($0)) }
        let found = try CoachApproaches.found(drawings, points: ilsFlown(), elevationFt: 778, flownOn: "2026-10-30")
        #expect(found.count == 1)
        let a = try #require(found.first)
        #expect(a.kind == "approach" && a.place == "KBUR" && a.flownOn == "2026-10-30" && a.elevationFt == 778)
        #expect(a.legs == [] && a.patterns == [])
        #expect(a.profile?.isEmpty == false)
        // The result and the points in the engine's own words, as the web sends them.
        let words = (a.findings ?? []).map(\.text)
        #expect(words.contains { $0.hasPrefix("Missed approach started") })
        #expect(words.contains { $0.hasPrefix("Within full scale all the way") })
        #expect(!(a.findings ?? []).contains { $0.tone == "stop" || $0.tone == "caution" })
    }

    @Test func noApproachesDrawnIsNoneFound() throws {
        #expect(try CoachApproaches.found([], points: ilsFlown(), elevationFt: nil, flownOn: "2026-10-30").isEmpty)
    }

    @Test func anApproachIsTrimmedToItsProfileFindingsAndElevation() throws {
        let drawing = try CoachApproaches.drawing(planned("I08-Y"))
        let flown = try #require(try Engine.approachDebrief(drawing: drawing, points: ilsFlown()))
        let a = CoachApproaches.trimmed(flown, elevationFt: nil, flownOn: "2026-10-30")
        // The chart's name for it, so the coach says which approach.
        #expect(a.procedure == flown.name && a.procedure?.isEmpty == false)
        #expect(a.elevationFt == nil)
        #expect(a.findings == flown.findings.map { APICoachFinding(text: $0.text, tone: $0.tone) })
        #expect(a.profile == flown.profile.track.map { APICoachProfilePoint(altFt: $0.altFt, off: $0.off, toGoNm: $0.toGoNm) })
    }
}
