import Foundation
import Observation

/// One thing to tell the passengers before the flight, with where it
/// comes from, shown under it.
struct PassengerItem: Equatable, Identifiable, Sendable, Decodable {
    let key: String
    let title: String
    let source: String
    var id: String { key }

    enum CodingKeys: String, CodingKey {
        case key, title
        case source = "rule"
    }
}

/// The passengers' briefing (#220's sibling, #223), ticked off before
/// engine start, and the flight in a few lines to send them. Its items
/// follow the FAASTeam's SAFETY briefing (Seat belts, Air, Fire, Exits,
/// Traffic and talking, Your questions: FAA Safety Briefing,
/// "Passenger SAFETY briefing", Jan/Feb 2007 and Jul/Aug 2014), which
/// also covers the passenger briefing the Private Pilot ACS
/// (FAA-S-ACS-6C) asks for in task PA.II.B, skill S2: belts, harnesses,
/// doors, passenger conduct, a sterile cockpit, keeping clear of the
/// propeller and the emergency procedures. Of them only the first is a
/// regulation's: 14 CFR 91.107(a)(1) has the pilot in command make sure
/// each person aboard is shown how to fasten and unfasten their belt and
/// harness, and (a)(2) and (3) that they are told to fasten them, and
/// have them fastened, for taxi, takeoff and landing.
enum PassengerBriefing {
    /// The items and their sources, the engine's (`passenger_briefing`),
    /// as the web and Android list them.
    static let items: [PassengerItem] = (try? Engine.call("passenger_briefing", json: [:])) ?? []

    /// A field as the passengers would know it: its name with its ident,
    /// or the ident alone where the name is not known.
    static func place(_ ident: String, _ name: String?) -> String {
        guard let name, !name.isEmpty else { return ident }
        return "\(name) (\(ident))"
    }

    /// A clock time on this device's clock, "09:05", as the web app's
    /// clockTime writes it.
    static func clock(_ date: Date, in zone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// The destination's report in plain words: "VFR, no ceiling, 10 sm".
    static func weather(_ metar: Metar?) -> String? {
        guard let metar else { return nil }
        let ceiling = metar.ceilingFt.map { "ceiling \(Formats.feet($0))" } ?? "no ceiling"
        let visibility = metar.visibilitySm.map { "\(AirportWords.plain($0)) sm" }
        let words = [metar.flightCategory, ceiling, visibility].compactMap { $0 }
        return words.joined(separator: ", ")
    }

    /// The flight in a few lines for the passengers (the web app's
    /// passengerMessage): where to, when it leaves on this device's clock
    /// and in UTC, about how long in the air and when it lands, and the
    /// destination's weather now, where it reports.
    static func message(dep: String, depName: String?, dest: String, destName: String?, departs: Date?,
                        eteMin: Double?, weather: String?, zone: TimeZone = .current) -> String {
        let flying = eteMin.map(StripData.duration)
        // From the exact minutes, as the nav log's arrival is.
        let lands = departs.flatMap { at in eteMin.map { at.addingTimeInterval($0 * 60) } }
        var lines = ["\(place(dep, depName)) to \(place(dest, destName))"]
        if let departs {
            var line = "Leaving \(clock(departs, in: zone)) (\(AirportWords.zulu(departs)))"
            if let flying { line += ", about \(flying) in the air" }
            if let lands { line += ", landing about \(clock(lands, in: zone))" }
            lines.append(line + ".")
        } else if let flying {
            lines.append("About \(flying) in the air.")
        }
        if let weather { lines.append("Weather at \(dest) now: \(weather).") }
        return lines.joined(separator: "\n")
    }
}

/// The passenger briefing's screen: the items ticked for this flight,
/// kept on the device by its route and day so they are there when the
/// screen is opened again, and the time it leaves, for the message.
@MainActor
@Observable
final class PassengerBriefingModel {
    static let prefix = "passengers:"

    let flight: String
    @ObservationIgnored private let defaults: UserDefaults
    private(set) var ticked: Set<String>
    var departs: Date

    /// `flight` names it: the route and the day (PassengerBriefingModel.flight).
    init(flight: String, departs: Date = PassengerBriefingModel.nextQuarterHour(), defaults: UserDefaults = .standard) {
        self.flight = flight
        self.departs = departs
        self.defaults = defaults
        ticked = Set(defaults.stringArray(forKey: Self.prefix + flight) ?? [])
    }

    /// A flight's name for its ticks: its fields in order and this
    /// device's calendar day, so tomorrow's flight of the same route
    /// starts unticked.
    static func flight(idents: [String], on day: Date = Date()) -> String {
        "\(idents.joined(separator: "-"))|\(Day.string(day))"
    }

    /// The next quarter hour from now, the time a flight planned now
    /// might leave until the pilot sets it.
    static func nextQuarterHour(after now: Date = Date()) -> Date {
        let quarter = 15.0 * 60
        return Date(timeIntervalSince1970: (now.timeIntervalSince1970 / quarter).rounded(.up) * quarter)
    }

    var done: Int { PassengerBriefing.items.filter { ticked.contains($0.key) }.count }

    func isTicked(_ key: String) -> Bool { ticked.contains(key) }

    func toggle(_ key: String) {
        if ticked.contains(key) { ticked.remove(key) } else { ticked.insert(key) }
        defaults.set(Array(ticked).sorted(), forKey: Self.prefix + flight)
    }
}
