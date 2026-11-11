import Foundation

/// A field's figures on the phone with no signal, each the engine's or a
/// report as the planner last sent it: the weather (METAR and TAF as
/// sent), the wind on its runways, the density altitude. Asked by the
/// on-device tools and by the engine's own words; nothing is weighed or
/// worked out here but by the engine (Engine/Generated/EngineCalls).
enum FieldFigures {
    /// The METAR and the TAF the briefing holds for a field, as sent, with
    /// the flight category the planner read off the METAR (AIM 7-1-7).
    /// The ids are the planner's own ("metar:KMSN", "taf:KMSN").
    static func weather(_ ident: String?, facts: OnDeviceFacts) throws -> [AskFigure] {
        guard let field = facts.field(ident) else { throw AskRefused(why: notHeld(ident, facts)) }
        var out: [AskFigure] = []
        if let metar = field.metar, let raw = metar.raw {
            let category = metar.flightCategory.map { ", \($0)" } ?? ""
            out.append(AskFigure(id: "metar:\(field.ident)", label: "\(field.ident) METAR\(category)",
                                 said: "\(field.ident)'s METAR\(category): \(raw)",
                                 from: "the METAR as sent (Aviation Weather Center), held from the last briefing\(asOf(facts))"))
        }
        if let taf = field.taf {
            out.append(AskFigure(id: "taf:\(field.ident)", label: "\(field.ident) TAF", said: "\(field.ident)'s TAF: \(taf)",
                                 from: "the TAF as sent (Aviation Weather Center), held from the last briefing\(asOf(facts))"))
        }
        guard !out.isEmpty else { throw AskRefused(why: "This iPhone holds no METAR or TAF for \(field.ident).") }
        return out
    }

    /// The reported wind across a field's runways. A runway named ("36",
    /// "18L") is worked out by the engine's wind_components on that end's
    /// true heading against the METAR's wind, also true (FAA-H-8083-28B 24.4.3.5, the METAR's wind group;
    /// the runway ends' true headings are NASR's), steady and in the gusts;
    /// with none named, each runway's favoured end as the planner gave it
    /// (wingtip.runway_wind, the same rule).
    static func crosswind(_ ident: String?, runway: String?, facts: OnDeviceFacts) throws -> [AskFigure] {
        guard let field = facts.field(ident) else { throw AskRefused(why: notHeld(ident, facts)) }
        guard let metar = field.metar, let raw = metar.raw else { throw AskRefused(why: "This iPhone holds no METAR for \(field.ident).") }
        let from = "the engine's wind_components (FAA-H-8083-25C ch. 11) from \(field.ident)'s METAR as sent, \(raw)\(asOf(facts))"
        if try Engine.windCalm(speedKt: metar.windSpeedKt) {
            // Calm is the engine's: a reported speed of 0 (AIM 7-1-28).
            return [AskFigure(id: "wind:\(field.ident)", label: "\(field.ident) wind", said: "The wind at \(field.ident) is calm.", from: from)]
        }
        guard let fromDeg = metar.windDirTrueDeg, let kt = metar.windSpeedKt else {
            throw AskRefused(why: "\(field.ident)'s METAR gives a variable wind, with no direction to work a crosswind from: \(raw)")
        }
        if let runway = runway.map(key), !runway.isEmpty {
            let ends = field.runways.flatMap { $0.runwayEnds ?? [] }
            guard let end = ends.first(where: { key($0.ident) == runway }), let heading = end.headingTrueDeg else {
                throw AskRefused(why: "This iPhone holds no runway \(runway) at \(field.ident).")
            }
            let steady = try Engine.windComponents(fromDeg: fromDeg, kt: kt, headingDeg: heading)
            var said = "Runway \(end.ident) at \(field.ident): \(components(steady.headwindKt, steady.crosswindKt))"
            if let gust = metar.windGustKt {
                let gusting = try Engine.windComponents(fromDeg: fromDeg, kt: gust, headingDeg: heading)
                said += "; in the gusts, \(components(gusting.headwindKt, gusting.crosswindKt))"
            }
            return [AskFigure(id: "wind:\(field.ident):\(end.ident)", label: "\(field.ident) runway \(end.ident) wind", said: said + ".", from: from)]
        }
        let winds = field.runways.compactMap(\.wind)
        guard !winds.isEmpty else { throw AskRefused(why: "This iPhone holds no runways for \(field.ident).") }
        return winds.map { wind in
            var said = "Runway \(wind.end) at \(field.ident): \(components(wind.headwindKt, wind.crosswindKt))"
            if let gust = wind.gustCrosswindKt { said += ", \(Format.speed(abs(gust))) across in the gusts" }
            return AskFigure(id: "wind:\(field.ident):\(wind.end)", label: "\(field.ident) runway \(wind.end) wind", said: said + ".",
                             from: "the planner's runway winds (wingtip.runway_wind, FAA-H-8083-25C ch. 11) from \(field.ident)'s METAR as sent, \(raw)\(asOf(facts))")
        }
    }

    /// A field's density altitude from its METAR: the pressure altitude from
    /// its elevation and altimeter setting, then the density altitude at
    /// the reported temperature, both the engine's (PHAK ch. 4).
    static func densityAltitude(_ ident: String?, facts: OnDeviceFacts) throws -> [AskFigure] {
        guard let field = facts.field(ident) else { throw AskRefused(why: notHeld(ident, facts)) }
        guard let elevation = field.elevationFt else { throw AskRefused(why: "This iPhone holds no elevation for \(field.ident).") }
        guard let metar = field.metar, let raw = metar.raw, let altimeter = metar.altimeterInHg, let temp = metar.tempC else {
            throw AskRefused(why: "This iPhone holds no altimeter setting and temperature for \(field.ident).")
        }
        let pressure = try Engine.pressureAltitudeFt(elevationFt: elevation, altimeterInhg: altimeter)
        let density = try Engine.gonogoDensityAltitude(pressureAltFt: pressure, tempC: temp)
        let said = "\(field.ident)'s density altitude is \(Format.altitude(density.rounded())) (pressure altitude \(Format.altitude(pressure.rounded())), field \(Format.altitude(elevation)))."
        return [AskFigure(id: "density:\(field.ident)", label: "\(field.ident) density altitude", said: said,
                          from: "the engine's pressure_altitude_ft and gonogo_density_altitude (PHAK ch. 4) from \(field.ident)'s METAR as sent, \(raw)\(asOf(facts))")]
    }

    /// "8 kt headwind, 5 kt across from the right": the engine's signs, a
    /// tailwind negative and a crosswind from the right positive.
    static func components(_ head: Double, _ cross: Double) -> String {
        let along = head < 0 ? "\(Format.speed(abs(head))) tailwind" : "\(Format.speed(head)) headwind"
        let side = cross == 0 ? "no crosswind" : "\(Format.speed(abs(cross))) across from the \(cross > 0 ? "right" : "left")"
        return "\(along), \(side)"
    }

    /// A runway end as a pilot says it: "09" and "9" alike.
    static func key(_ ident: String) -> String {
        let upper = ident.uppercased().replacingOccurrences(of: "RUNWAY", with: "").trimmingCharacters(in: .whitespaces)
        let trimmed = upper.drop { $0 == "0" }
        return trimmed.isEmpty ? upper : String(trimmed)
    }

    /// " (as of 1432Z)": when the plan, and the briefing with it, were fetched.
    static func asOf(_ facts: OnDeviceFacts) -> String {
        facts.plannedAt.map { " (fetched \(Format.zulu($0)))" } ?? ""
    }

    static func notHeld(_ ident: String?, _ facts: OnDeviceFacts) -> String {
        if facts.fields.isEmpty { return "This iPhone holds no briefing for the route yet." }
        let held = facts.fields.keys.sorted().joined(separator: ", ")
        return "This iPhone holds the briefing's fields only (\(held)), not \(ident?.uppercased() ?? "that field")."
    }
}
