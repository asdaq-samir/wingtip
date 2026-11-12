import Foundation

/// A link opened in the app, read into what it asks for: the site's own
/// addresses (universal links, the associated domain in project.yml) as
/// the web app's ShareMenu, AirportCard and AirplaneCard write them --
/// `/app/plan?dep=C81&stops=KJVL&dest=KDLH` a route shared, `?place=KDLH`
/// a field's card, `?airplane=N3429J` an airplane's profile,
/// `?flight=a1b2c3` an airplane tracked, `?open=logbook`
/// one of the app's screens (design/screens.json; the same from the app's
/// own wingtipmaps://plan?open=logbook) -- and a track
/// file (GPX, KML) handed over from Files or Mail, which the app is a
/// viewer of (CFBundleDocumentTypes), and a Wingtip flight file
/// (FlightFile), the app's own type. The sign-in link is not one of
/// these: Session.open takes it. The answer is an AppCommand, done by
/// RootView (CommandHost), as Siri's asks are.
enum Links {
    /// The file types the app opens, as Finder and Files name them.
    static let trackExtensions: Set<String> = ["gpx", "kml"]
    /// A Wingtip flight file's (UTType.wingtipFlight).
    static let flightExtension = "wingtip"

    static func command(for url: URL) -> AppCommand? {
        if url.isFileURL {
            // A Wingtip flight file (FlightFile): previewed as a shared
            // flight is, never planned until Use This Plan.
            if url.pathExtension.lowercased() == flightExtension { return FlightFile.read(at: url).map { .sharedFlight(.file($0)) } }
            return trackExtensions.contains(url.pathExtension.lowercased()) ? .track(url) : nil
        }
        guard let query = query(of: url) else { return nil }
        // A flight another pilot sent (`open=shared`): previewed first, so
        // read before the route below, which would plan it at once.
        if query[Screen.linkKey]?.lowercased() == Screen.shared.rawValue {
            return SharedFlightLink.of(query).map { .sharedFlight($0) }
        }
        if let place = ident(query["place"]) { return .weather(ident: place) }
        if let tail = ident(query[LinkKey.airplane.rawValue]) { return .airplane(tail: tail) }
        if let hex = query["flight"]?.trimmingCharacters(in: .whitespaces).lowercased(), !hex.isEmpty { return .aircraft(hex: hex) }
        // The route as the web app's URL has it: idents, the stops
        // comma-separated; a link with only a destination plans from the
        // field nearest the airplane, as Siri's "plan a trip to" does.
        let stops = (query["stops"] ?? "").split(separator: ",").compactMap { ident(String($0)) }
        switch (ident(query["dep"]), ident(query["dest"])) {
        case (let dep?, let dest?): return .planRoute(dep: dep, stops: stops, dest: dest)
        case (nil, let dest?): return .planTo(ident: dest)
        default: return screen(for: url).map { .open($0) }
        }
    }

    /// The screen a link names (`open=`, design/screens.json): alone, the
    /// command; beside a route, opened once the route is in.
    static func screen(for url: URL) -> Screen? {
        query(of: url)?[Screen.linkKey].flatMap { Screen(rawValue: $0.lowercased()) }
    }

    /// The link's keys, where it is the planner's address: the site's
    /// (`https://<host>/app/plan?...`) or the app's own scheme
    /// (`wingtipmaps://plan?...`).
    static func query(of url: URL) -> [String: String]? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let ours = parts.scheme == Screen.scheme ? parts.host == Screen.schemeHost : parts.path.hasSuffix(Screen.linkPath)
        guard ours else { return nil }
        return Dictionary(parts.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { _, last in last })
    }

    /// An ident as the planner takes one: letters and figures, upper case.
    static func ident(_ raw: String?) -> String? {
        let text = raw?.trimmingCharacters(in: .whitespaces).uppercased() ?? ""
        guard !text.isEmpty, text.count <= 8, text.allSatisfy({ $0.isLetter || $0.isNumber }) else { return nil }
        return text
    }
}
