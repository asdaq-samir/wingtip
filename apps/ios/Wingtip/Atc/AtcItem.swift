import Foundation

/// One thing a call to us asks, as the engine's atc_call reads it
/// (engine/crates/radio's atc; held to the shared fixture atcCalls.json).
/// The contract leaves an item untyped (a tagged union by `kind`), so its
/// members are read here, each optional, from the engine's own keys.
struct AtcItem: Decodable, Equatable, Sendable {
    let kind: String
    var verb: String?
    var limit: String?
    var ft: Double?
    var min: Double?
    var turn: String?
    var byDeg: Double?
    var deg: Double?
    var said: String?
    var places: [String]?
    var asFiled: Bool?
    var direction: String?
    var fix: String?
    var on: String?
    var onDeg: Double?
    var turns: String?
    var efc: String?
    var published: Bool?
    var facility: String?
    /// As said, "125.35".
    var mhz: String?
    var code: String?
    /// As said, "29.92".
    var inhg: String?
    var name: String?
    var cleared: Bool?
    var runway: String?
    var what: String?

    enum CodingKeys: String, CodingKey {
        case kind, verb, limit, ft, min, turn, deg, said, places, direction, fix, on, turns, efc, published, facility, mhz, code, inhg, name, cleared, runway, what
        case byDeg = "by_deg", asFiled = "as_filed", onDeg = "on_deg"
    }

    /// The items of an atc_call answer.
    static func items(_ values: [JSONValue]) -> [AtcItem] {
        values.compactMap { try? JSONDecoder().decode(AtcItem.self, from: $0.data) }
    }

    /// The item in words, as the card writes it (the web's itemWords):
    /// altitudes as ATC says them (the engine's altitude_said, AIM 4-2-9),
    /// headings in three figures (AIM 4-2-10), times in UTC with a Z
    /// (AIM 4-2-12).
    var words: String {
        func capital(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }
        func three(_ d: Double) -> String { String(Int(d.rounded())).leftPadded(to: 3) }
        func altitude(_ ft: Double?) -> String { ft.map { (try? Engine.altitudeSaid(ft: $0)) ?? Format.altitude($0) } ?? "" }
        let points = ["north": "N", "northeast": "NE", "east": "E", "southeast": "SE", "south": "S", "southwest": "SW", "west": "W", "northwest": "NW"]
        switch kind {
        case "altitude":
            return "\(capital(verb ?? "maintain"))\(limit.map { " \($0)" } ?? "") \(altitude(ft))"
        case "expect":
            return "Expect \(altitude(ft))" + (min.map { " \(Int($0)) min after departure" } ?? "")
        case "heading":
            if let byDeg { return ["Turn", turn, "\(Int(byDeg))°"].compactMap { $0 }.joined(separator: " ") }
            guard let deg else { return "Runway heading" }
            return "\(turn.map { "\(capital($0)) heading" } ?? "Heading") \(three(deg))"
        case "direct":
            return "Direct \((said ?? "").uppercased())"
        case "route":
            let via = (places ?? []).map { $0.uppercased() }.joined(separator: ", ")
            return (limit.map { "Cleared to \(capital($0))" } ?? "Cleared") + (via.isEmpty ? "" : " via \(via)") + (asFiled == true ? ", then as filed" : "")
        case "class_b":
            return "Cleared into Class B"
        case "hold":
            let at = (fix ?? "").uppercased()
            if published == true { return "Hold at \(at) as published" + (efc.map { ", EFC \($0)Z" } ?? "") }
            var parts = ["Hold\(direction.map { " \(points[$0] ?? $0)" } ?? "") of \(at)"]
            if let on, let onDeg { parts.append("\(three(onDeg)) \(on)") }
            if let turns { parts.append("\(turns) turns") }
            if let efc { parts.append("EFC \(efc)Z") }
            return parts.joined(separator: ", ")
        case "frequency":
            return "\(facility.map { "\(capital($0)) " } ?? "Contact ")\(mhz ?? "")"
        case "squawk":
            return "Squawk \(code ?? "")"
        case "altimeter":
            return "Altimeter \(inhg ?? "")"
        case "approach":
            return "\(cleared == true ? "Cleared" : "Expect") \(name ?? "")\(runway.map { " \($0)" } ?? "") approach"
        case "runway":
            let said = ["land": "cleared to land", "takeoff": "cleared for takeoff", "option": "cleared for the option", "line up and wait": "line up and wait"]
            if what == "hold short" { return "Hold short runway \(runway ?? "")" }
            return "Runway \(runway ?? "")" + (what.flatMap { said[$0] }.map { ", \($0)" } ?? "")
        default:
            return capital(kind.replacingOccurrences(of: "_", with: " "))
        }
    }
}
