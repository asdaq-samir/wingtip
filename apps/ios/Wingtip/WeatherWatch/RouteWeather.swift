import Foundation

/// A briefing as the engine's weather_worse reads it (EngineContract.WeatherReading):
/// each field's METAR ceiling and visibility, the SIGMETs, AIRMETs and
/// G-AIRMETs with whether the briefing places them on the route, and each
/// TAF's ceiling and visibility for the flight's time there (else the
/// worst over the flight, as the planner's briefing_changes reads it),
/// marked where the flight lands. Only carried across: what is worse is
/// the engine's to say.
enum RouteWeather {
    static func of(_ briefing: Briefing, lands: Set<String>) -> EngineContract.WeatherReading {
        let metars = briefing.metars.additionalProperties.keys.sorted().compactMap { ident -> EngineContract.WorseField? in
            guard let m = briefing.metars.additionalProperties[ident] ?? nil else { return nil }
            return EngineContract.WorseField(ident: ident, ceilingFt: m.ceilingFt, visibilitySm: m.visibilitySm, ceilingUnknown: m.ceilingUnknown, arrival: nil)
        }
        var advisories = briefing.hazards.map { h in
            EngineContract.WorseAdvisory(key: h.raw ?? "\(h.type ?? "") \(h.hazard ?? "") \(h.altitudeLowFt ?? -1) \(h.altitudeHighFt ?? -1)",
                                         kind: kind(h.type), hazard: h.hazard, onRoute: h.onRoute != nil)
        }
        advisories += (briefing.gairmets ?? []).map { g in
            EngineContract.WorseAdvisory(key: "G-AIRMET \(g.hazard) \(g.severity ?? "") \(g.dueTo ?? "") \(g.altitudeLowFt ?? -1) \(g.altitudeHighFt ?? -1) \(g.fromFreezingLevel ?? false)",
                                         kind: "G-AIRMET", hazard: g.hazard, onRoute: g.onRoute != nil)
        }
        let tafs = briefing.forecast.stations.map { s in
            let atEta = s.eta != nil
            return EngineContract.WorseField(ident: s.icaoId, ceilingFt: atEta ? s.etaCeilingFt : s.ceilingFt,
                                             visibilitySm: atEta ? s.etaVisibilitySm : s.visibilitySm,
                                             ceilingUnknown: atEta ? s.etaCeilingUnknown : s.ceilingUnknown, arrival: lands.contains(s.icaoId))
        }
        return EngineContract.WeatherReading(metars: metars, advisories: advisories, tafs: tafs)
    }

    /// An advisory's kind as the app words it: "SIGMET", "Convective
    /// SIGMET", "AIRMET", as the AWC sends its type.
    static func kind(_ type: String?) -> String {
        switch type?.uppercased().replacingOccurrences(of: "_", with: " ") {
        case "CONVECTIVE SIGMET", "CONVECTIVE": "Convective SIGMET"
        case let other?: other.isEmpty ? "advisory" : other
        case nil: "advisory"
        }
    }

    /// The changes not told yet, and the notification that tells them:
    /// one at a time, each change once (its key), the fields they name for
    /// Siri. Nil where there is nothing new.
    struct Telling: Equatable {
        let title: String
        let body: String
        let keys: [String]
        let fields: [String]
    }

    static func telling(_ worse: [EngineContract.WeatherWorseItem], told: Set<String>, route: String) -> Telling? {
        let fresh = worse.filter { !told.contains($0.key) }
        guard !fresh.isEmpty else { return nil }
        var fields: [String] = []
        for ident in fresh.compactMap(\.ident) where !fields.contains(ident) { fields.append(ident) }
        return Telling(title: "Weather worse on \(route)", body: fresh.map { $0.line + "." }.joined(separator: " "),
                       keys: fresh.map(\.key), fields: fields)
    }
}
