import Foundation
import Observation

/// The AWC's forecast icing (CIP and FIP, as its GFA draws them) on each
/// leg at the altitude it is flown (/api/icing/route,
/// wingtip.icing_forecast; what it says is the engine's
/// icing_forecast_route on the planner), the Brief's model of it as the
/// web's useIcingForecast is. Asked once the briefing has the nav log's
/// legs (`legs_from` "navlog", one fix more than the legs), each leg read
/// for the hour of its middle.
typealias IcingForecastAnswer = APIIcingForecast

@MainActor
@Observable
final class ForecastIcing {
    /// The question as /api/icing/route takes it.
    struct Query: Equatable, Sendable {
        var fixes: String
        var altFt: String
        var legMin: String
        var groundMin: String
    }

    private(set) var answer: IcingForecastAnswer?
    private(set) var problem: String?
    private(set) var asking = false
    private var asked: Query?

    /// The question for a briefing and its nav log's legs; nil until the
    /// briefing's fixes are the log's and every leg has its time.
    static func query(briefing: Briefing?, legs: [Leg]) -> Query? {
        guard let briefing, briefing.legsFrom == "navlog", let fixes = briefing.legFixes,
              !legs.isEmpty, fixes.count == legs.count + 1, legs.allSatisfy({ $0.eteMin != nil }) else { return nil }
        return Query(
            fixes: fixes.map { "\(Format.number($0.lat, decimals: 5)),\(Format.number($0.lon, decimals: 5))" }.joined(separator: ";"),
            altFt: legs.map { String(Int($0.altitudeFt.rounded())) }.joined(separator: ","),
            legMin: legs.map { Format.number($0.eteMin ?? 0, decimals: 1) }.joined(separator: ","),
            groundMin: legs.map { Format.number($0.groundMin ?? 0, decimals: 0) }.joined(separator: ","))
    }

    /// Asked for the plan's briefing and legs; the same question is not
    /// asked twice, and none clears the answer.
    func refresh(briefing: Briefing?, legs: [Leg]) async {
        guard let query = Self.query(briefing: briefing, legs: legs) else {
            asked = nil
            answer = nil
            problem = nil
            return
        }
        guard query != asked else { return }
        asked = query
        asking = true
        defer { asking = false }
        do {
            answer = try await Planner.call {
                try await $0.icingOnTheRoute(query: .init(fixes: query.fixes, altFt: query.altFt, legMin: query.legMin, groundMin: query.groundMin))
                    .ok.body.json
            }
            problem = nil
        } catch {
            guard !Task.isCancelled else { return }
            asked = nil
            problem = "The forecast icing could not be checked: aviationweather.gov didn't respond. Verify it separately before flight."
        }
    }

    /// A severity as a row says it: "Light", "None"; "No forecast" for a
    /// leg the AWC had none for (the web's severityWord).
    static func severityWord(_ severity: String?) -> String {
        guard let severity, !severity.isEmpty else { return "No forecast" }
        return severity.prefix(1).uppercased() + severity.dropFirst()
    }

    /// Whether a leg's forecast finds icing at its altitude.
    static func iced(_ leg: APIIcingForecastLeg) -> Bool {
        leg.severity != nil && leg.severity != "none"
    }

    /// A leg's figure: "Light at 6,500 ft, 40% of it".
    static func value(_ leg: APIIcingForecastLeg) -> String {
        var said = "\(severityWord(leg.severity)) at \(Format.altitude(leg.altitudeFt))"
        if iced(leg), let share = leg.share, share < 1 { said += ", \(Int((share * 100).rounded()))% of it" }
        return said
    }

    /// The line under it: the levels icing is forecast between over the
    /// leg, for a way out above or below (AIM 7-1-19).
    static func detail(_ leg: APIIcingForecastLeg) -> String? {
        if let layer = leg.layer { return "Icing forecast \(Format.altitudeRange(layer.bottomFt, layer.topFt))" }
        return leg.severity == nil ? nil : "No icing forecast over the leg"
    }
}
