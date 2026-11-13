import Foundation
import Testing
@testable import Wingtip

/// What must never break in the air, on the iPhone: every worked example
/// of the shared golden set (apps/web/src/lib/fixtures/flightCritical.json,
/// each from its FAA source: the nav log's wind triangle, groundspeed,
/// heading and fuel from FAA-H-8083-25C ch. 16, 14 CFR 91.159 and 91.179
/// altitudes, 91.151 and 91.167 reserves, 91.155 minimums, AIM 5-3-8 hold
/// entries, glide at a ratio) asked through this app's own bridge
/// (the engine's call), as the engine's Rust test (flight_critical.rs) asks it in
/// process; the nav log's case through the typed call the app's screens
/// decode; and the emergency's general guidance with no airplane picked.
/// Android's FlightCriticalEngineTest is the twin.
private final class FlightCriticalBundle {}

private struct FixtureMissing: Error {}

private func golden() throws -> [[String: Any]] {
    guard let url = Bundle(for: FlightCriticalBundle.self).url(forResource: "flightCritical", withExtension: "json"),
          let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any],
          let cases = object["cases"] as? [[String: Any]]
    else { throw FixtureMissing() }
    return cases
}

/// A JSON true or false, not a number that bridges to one.
private func isBool(_ n: NSNumber) -> Bool { CFGetTypeID(n as CFTypeRef) == CFBooleanGetTypeID() }

/// Where `got` is not `want`, as the Rust test judges it: a number within
/// its case's tolerance (by member name, "" for a bare answer; exact where
/// not given), an object by the members `want` names, the rest as JSON.
private func difference(_ got: Any?, _ want: Any?, within: [String: Double], key: String = "") -> String? {
    let got: Any? = got is NSNull ? nil : got
    let want: Any? = want is NSNull ? nil : want
    guard let got, let want else {
        return got == nil && want == nil ? nil : "\(key): \(String(describing: got ?? "null")) is not \(String(describing: want ?? "null"))"
    }
    if let g = got as? NSNumber, let w = want as? NSNumber, !isBool(g), !isBool(w) {
        let tolerance = within[key] ?? 0
        return abs(g.doubleValue - w.doubleValue) <= tolerance + 1e-9 ? nil : "\(key): \(g) is not \(w) (within \(tolerance))"
    }
    if let g = got as? [String: Any], let w = want as? [String: Any] {
        for (k, v) in w.sorted(by: { $0.key < $1.key }) {
            guard g.keys.contains(k) else { return "\(k): missing" }
            if let d = difference(g[k], v, within: within, key: k) { return key.isEmpty ? d : "\(key).\(d)" }
        }
        return nil
    }
    if let g = got as? [Any], let w = want as? [Any] {
        guard g.count == w.count else { return "\(key): \(g.count) items, not \(w.count)" }
        for (a, b) in zip(g, w) {
            if let d = difference(a, b, within: within, key: key) { return d }
        }
        return nil
    }
    return "\(got)" == "\(want)" ? nil : "\(key): \(got) is not \(want)"
}

@MainActor
struct FlightCriticalTests {
    @Test func everyWorkedExampleHoldsThroughTheBridge() throws {
        let cases = try golden()
        #expect(cases.count >= 30)
        for c in cases {
            let name = c["name"] as? String ?? "", rule = c["rule"] as? String ?? ""
            #expect(!(c["source"] as? String ?? "").isEmpty, "\(name): no source")
            let input = (c["input"] as? [String: Any] ?? [:]).mapValues { $0 is NSNull ? nil : Optional($0) }
            let text = try Engine.callText(rule, input)
            let got = try JSONSerialization.jsonObject(with: Data(text.utf8), options: .fragmentsAllowed)
            if let d = difference(got, c["want"], within: c["within"] as? [String: Double] ?? [:]) {
                Issue.record("\(name) (\(rule)): \(d)")
            }
        }
    }

    /// The handbook's leg through the typed call the screens read:
    /// FAA-H-8083-25C ch. 16, TC 090, wind 045 at 40 kt, TAS 120 kt: TH
    /// 076, GS 88 kt; 220 NM in 2:30 and about 20 gallons at 8 gal/hr;
    /// 5 degrees east variation, east is least: MH 071.
    @Test func theNavLogsFiguresAreTheEnginesForTheHandbooksLeg() throws {
        let c = try #require(try golden().first { $0["rule"] as? String == "navlog_leg" })
        let data = try JSONSerialization.data(withJSONObject: c["input"] as Any)
        let input = try JSONDecoder().decode(EngineContract.NavlogLegInput.self, from: data)
        let leg = try Engine.navlogLeg(start: input.start, end: input.end, altitudeFt: input.altitudeFt, profile: input.profile,
                                       wind: input.wind, oatC: input.oatC, variationDeg: input.variationDeg)
        #expect(abs((leg.trueCourseDeg ?? 0) - 90) < 0.01)
        #expect(abs((leg.trueHeadingDeg ?? 0) - 76) <= 1)
        #expect(abs((leg.magneticHeadingDeg ?? 0) - 71) <= 1)
        #expect(abs((leg.groundspeedKt ?? 0) - 88) <= 1)
        #expect(abs((leg.eteMin ?? 0) - 150) <= 2)
        #expect(abs((leg.fuelGal ?? 0) - 20) <= 0.5)
    }

    @Test func withNoAirplaneTheEmergencyShowsGeneralGuidanceAndNoAirplanesFigures() throws {
        let guidance = try #require(try Emergency.guidance(airplaneChosen: false))
        #expect(!guidance.isEmpty && guidance.allSatisfy { !$0.source.isEmpty })
        // AIM 6-2-2: squawk 7700; AIM 6-3-1, 6-3-2: MAYDAY, 121.5.
        #expect(guidance.contains { $0.title.contains("7700") && $0.source.contains("6-2-2") })
        #expect(guidance.contains { $0.title.contains("121.5") })
        // No speed, glide or distance of any airplane's.
        #expect(!guidance.contains { "\($0.title) \($0.detail)".contains("KIAS") || "\($0.title) \($0.detail)".contains(" nm") })
        // With one picked, its own checklist instead.
        #expect(try Emergency.guidance(airplaneChosen: true) == nil)
    }
}
