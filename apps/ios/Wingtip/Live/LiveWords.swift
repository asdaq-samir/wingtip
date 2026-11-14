import Foundation

/// The live reports in the words the web writes them (lib/liveReports,
/// lib/rvrRows, lib/departureWords, lib/atis): what they mean for a
/// flight is the engine's (read_datis, rvr_check); only the words are here.
enum LiveWords {
    /// Idents as the planner's lists take them, upper case and once each.
    static func idents(_ list: [String?]) -> [String] {
        Array(Set(list.compactMap { $0?.trimmingCharacters(in: .whitespaces).uppercased() }.filter { !$0.isEmpty })).sorted()
    }

    /// A UNIX time as the app says one in Zulu: "2130Z".
    static func zulu(_ unixS: Double) -> String {
        Format.zulu(Date(timeIntervalSince1970: unixS))
    }

    // MARK: Programs

    /// A program in a line: "Ground stop at EWR until 2130Z, delays
    /// average 45 min"; a restriction (miles in trail) is no program and
    /// gives none (the web's programLine).
    static func programLine(_ p: FlowProgram) -> String? {
        guard p.restriction != true, let program = p.program, !program.isEmpty else { return nil }
        let name = program.prefix(1).uppercased() + program.dropFirst()
        let until = p.ends.map { " until \(zulu($0))" } ?? ""
        let delay = p.averageDelayMin.map { ", delays average \($0) min" } ?? ""
        return "\(name) at \(p.airport)\(until)\(delay)"
    }

    static func programLines(_ programs: [FlowProgram]) -> [String] {
        programs.compactMap(programLine)
    }

    // MARK: Special activity airspace

    /// An area's status for its row, a badge and the words after it
    /// (rules.md §9): Active, then "until 2130Z (FAA SFDPS)"; Cold, then
    /// "next active 1400Z (FAA SFDPS)"; nil with no word of now.
    static func saaBadge(_ status: SaaStatus?) -> (status: BadgeStatus, rest: String)? {
        guard let status, let active = status.active else { return nil }
        let until = status.until.map { "until \(zulu($0)) " } ?? ""
        let next = !active ? (status.next.map { "next active \(zulu($0)) " } ?? "") : ""
        return (active ? .active : .cold, "\(until)\(next)(FAA SFDPS)")
    }

    // MARK: Tower departures

    /// A flight's latest tower departure event in a line: "Cleared 0457Z
    /// at KIND, gate B20, to KRSW (FAA TDES)". The feed sends the departure
    /// clearance's delivery, which is not a takeoff and is never called one.
    static func departureLine(_ e: DepartureEvent?) -> String? {
        guard let e else { return nil }
        let cleared = e.times?.additionalProperties["clearance_delivery"]
        var head = cleared.map { "Cleared \(zulu($0))" } ?? "Departure event"
        if let at = e.departure { head += " at \(at)" }
        let rest = [e.gate.map { "gate \($0)" }, e.destination.map { "to \($0)" }].compactMap { $0 }
        return ([head] + rest).joined(separator: ", ") + " (FAA TDES)"
    }

    // MARK: Runway visual range

    /// One runway end's readings as its row shows them.
    struct RvrRow: Equatable, Identifiable {
        let runway: String
        /// "6000+ · — · 6000+": touchdown, midpoint, rollout, ft.
        let readings: String
        /// "Under your 1/2 SM minimum (14 CFR 91.175(h))", where it is.
        let under: String?
        var id: String { runway }
    }

    /// One reading: "6000+" at the system's most (AIM 7-1-13), "—" where none.
    static func reading(_ ft: Int?, more: Bool?) -> String {
        guard let ft else { return Format.none }
        return more == true ? "\(ft)+" : String(ft)
    }

    /// A visibility as a pilot says a minimum: "1/2", "1 1/4", "3".
    static func smWords(_ sm: Double) -> String {
        let whole = Int(sm.rounded(.down))
        let eighths = Int(((sm - Double(whole)) * 8).rounded())
        let fraction = eighths == 0 ? "" : eighths % 4 == 0 ? "1/2" : eighths % 2 == 0 ? "\(eighths / 2)/4" : "\(eighths)/8"
        let said = [whole > 0 ? String(whole) : "", fraction].filter { !$0.isEmpty }.joined(separator: " ")
        return said.isEmpty ? "0" : said
    }

    /// The rows, runway end by runway end, judged against the pilot's own
    /// visibility minimum by the engine's rvr_check (14 CFR 91.175(h)(2)'s
    /// comparable values; a minimum past 1 1/4 SM has no RVR that shows
    /// it, and the engine leaves it unjudged).
    static func rvrRows(_ runways: [RunwayRvr], minimumSm: Double?) throws -> [RvrRow] {
        let checked = try Engine.rvrCheck(
            runways: runways.map { .init(runway: $0.runway, touchdownFt: $0.touchdownFt.map(Double.init), midpointFt: $0.midpointFt.map(Double.init), rolloutFt: $0.rolloutFt.map(Double.init)) },
            minimumSm: minimumSm)
        return runways.enumerated().map { i, r in
            let under = i < checked.runways.count && checked.runways[i].under == true
            return RvrRow(
                runway: r.runway,
                readings: [reading(r.touchdownFt, more: r.touchdownMore), reading(r.midpointFt, more: r.midpointMore), reading(r.rolloutFt, more: r.rolloutMore)].joined(separator: " · "),
                under: under && minimumSm != nil ? "Under your \(smWords(minimumSm!)) SM minimum (14 CFR 91.175(h))" : nil)
        }
    }

    // MARK: D-ATIS

    /// A D-ATIS broadcast's words read by the engine (read_datis, the same
    /// figures read_atis gives a broadcast heard), as the card's Atis so
    /// it is written as a heard one is.
    static func reading(_ text: String) throws -> Atis {
        try Engine.recoded(try Engine.readDatis(text: text))
    }

    /// A broadcast's title: "Arrival D-ATIS, information K".
    static func datisTitle(which: String?, letter: String?) -> String {
        let kind = which.map { $0.prefix(1).uppercased() + $0.dropFirst() + " D-ATIS" } ?? "D-ATIS"
        return kind + (letter.map { ", Information \($0)" } ?? "")
    }
}
