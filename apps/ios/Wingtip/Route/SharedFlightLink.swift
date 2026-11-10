import Foundation

/// A flight another pilot sent, as its link carries it (design/screens.json's
/// `shared` screen): the plan itself in the link's keys, or a saved flight's
/// share token, read from the gateway (GET /api/shared-flights/{token}),
/// or a flight file that carries the same link.
/// Opened as a preview first (SharedFlightModel); nothing is planned until
/// the pilot taps Use This Plan.
enum SharedFlightLink: Equatable, Sendable {
    case plan(SharedPlan)
    case saved(token: String)
    /// A Wingtip flight file opened from Files, AirDrop or Mail: its link's
    /// plan, and its nav log where it was saved with one (FlightFile).
    case file(FlightFile)

    /// The link's own keys read into a shared flight; nil where it names
    /// neither a token nor both ends of a route.
    static func of(_ query: [String: String]) -> SharedFlightLink? {
        if let token = query[LinkKey.share.rawValue]?.trimmingCharacters(in: .whitespaces),
           !token.isEmpty, token.count <= 32, token.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }) {
            return .saved(token: token)
        }
        guard let dep = Links.ident(query[LinkKey.dep.rawValue]), let dest = Links.ident(query[LinkKey.dest.rawValue]) else { return nil }
        let stops = (query[LinkKey.stops.rawValue] ?? "").split(separator: ",").compactMap { Links.ident(String($0)) }
        let feet = query[LinkKey.altitudeFt.rawValue].flatMap { Int($0) }.flatMap { (100...60_000).contains($0) ? $0 : nil }
        return .plan(SharedPlan(dep: dep, dest: dest, stops: stops, altitudeFt: feet,
                                depart: query[LinkKey.depart.rawValue].flatMap(SharedPlan.instant),
                                type: Links.ident(query[LinkKey.type.rawValue]),
                                rules: query[LinkKey.rules.rawValue].flatMap { FlightRules(rawValue: $0.lowercased()) },
                                tail: Links.ident(query[LinkKey.tail.rawValue])))
    }
}

/// The plan a link shares: its route, cruise altitude (feet MSL),
/// departure time, the sender's airplane type (shown, never assumed: the
/// receiver's own airplane flies it), flight rules, and the N-number only
/// where the sender chose to include it.
struct SharedPlan: Equatable, Sendable {
    var dep: String
    var dest: String
    var stops: [String] = []
    var altitudeFt: Int?
    var depart: Date?
    var type: String?
    var rules: FlightRules?
    var tail: String?

    var route: String { ([dep] + stops + [dest]).joined(separator: " → ") }

    /// The link to send: the site's planner with the preview open, and only
    /// the keys there are; the N-number only when the pilot turned it on.
    func link(includeTail: Bool, host: URL = Config.gateway) -> URL {
        var items = [URLQueryItem(name: Screen.linkKey, value: Screen.shared.rawValue),
                     URLQueryItem(name: LinkKey.dep.rawValue, value: dep),
                     URLQueryItem(name: LinkKey.dest.rawValue, value: dest)]
        if !stops.isEmpty { items.append(URLQueryItem(name: LinkKey.stops.rawValue, value: stops.joined(separator: ","))) }
        if let altitudeFt { items.append(URLQueryItem(name: LinkKey.altitudeFt.rawValue, value: String(altitudeFt))) }
        if let depart { items.append(URLQueryItem(name: LinkKey.depart.rawValue, value: Self.iso.string(from: depart))) }
        if let type { items.append(URLQueryItem(name: LinkKey.type.rawValue, value: type)) }
        if let rules { items.append(URLQueryItem(name: LinkKey.rules.rawValue, value: rules.rawValue)) }
        if includeTail, let tail { items.append(URLQueryItem(name: LinkKey.tail.rawValue, value: tail)) }
        return host.appending(path: Screen.linkPath).appending(queryItems: items)
    }

    /// A saved flight shared, as the gateway answers it: no flight rules
    /// are kept with a saved flight, so none are said.
    init(_ shared: GWSharedFlightDto) {
        self.init(dep: shared.departureIdent, dest: shared.destinationIdent, stops: shared.stops,
                  altitudeFt: shared.cruiseAltitudeFt, depart: shared.plannedFor.flatMap(Self.instant),
                  type: shared.aircraftType, rules: nil, tail: shared.aircraftTailNumber)
    }

    init(dep: String, dest: String, stops: [String] = [], altitudeFt: Int? = nil, depart: Date? = nil,
         type: String? = nil, rules: FlightRules? = nil, tail: String? = nil) {
        self.dep = dep; self.dest = dest; self.stops = stops; self.altitudeFt = altitudeFt
        self.depart = depart; self.type = type; self.rules = rules; self.tail = tail
    }

    private static var iso: ISO8601DateFormatter { ISO8601DateFormatter() }

    /// An ISO 8601 instant, with or without its fractions of a second.
    static func instant(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.date(from: text) ?? fractional.date(from: text)
    }
}
