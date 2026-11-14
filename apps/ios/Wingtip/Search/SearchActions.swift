import Foundation

/// A row of the one search's "Do" group (the Typing artboard): a route the
/// words name, Direct To a field, a screen by its name, and the question
/// put to the assistant. Pure, so the list for what is typed is tested
/// (OneSearchTests); the doing is the sheet's.
enum SearchAction: Hashable, Identifiable, Sendable {
    /// Idents alone (FieldCommands' route): the route planned.
    case route(dep: String?, stops: [String], dest: String)
    case directTo(String)
    case open(Screen)
    case ask(String)
    /// The traffic on the map turned on (the web's Show Traffic, where its
    /// Traffic Nearby opened the retired traffic page).
    case showTraffic

    var id: String {
        switch self {
        case .route(let dep, let stops, let dest): "route:\(dep ?? "")>\(stops.joined(separator: ","))>\(dest)"
        case .directTo(let ident): "direct:\(ident)"
        case .open(let screen): "open:\(screen.rawValue)"
        case .ask(let words): "ask:\(words)"
        case .showTraffic: "traffic"
        }
    }

    var title: String {
        switch self {
        case .route(let dep, let stops, let dest):
            dep.map { "Plan \(([$0] + stops + [dest]).joined(separator: " → "))" } ?? "Fly to \(dest)"
        case .directTo(let ident): "Direct To \(ident)"
        case .open(let screen): screen.title
        case .ask(let words): "Ask: “\(words)”"
        case .showTraffic: "Show Traffic"
        }
    }

    var systemImage: String {
        switch self {
        case .route: WingtipIcon.flightPlan
        case .directTo: WingtipIcon.directTo
        case .open(let screen): SearchActions.glyph(screen)
        case .ask: WingtipIcon.ask
        case .showTraffic: WingtipIcon.airplane
        }
    }
}

enum SearchActions {
    /// The screens offered by name, as the Do group lists them: every
    /// screen a pilot opens on its own, not the plan (the sheet's root),
    /// the search itself, Ask (the last row, always) or a shared flight,
    /// which only a link carries.
    static let offered: [Screen] = Screen.allCases.filter { ![.fpl, .airport, .ask, .shared].contains($0) }

    /// The screen a word of FieldCommands' opens, where there is one by
    /// that name; the strip's own pages have the rest.
    static func screen(_ word: FieldScreen) -> Screen? {
        switch word {
        case .airplane: .airplane
        case .logbook: .logbook
        case .setup: .setup
        case .brief: .brief
        case .nearest, .fuel, .food, .stops: .nearest
        case .navlog: .navlog
        case .profile, .altitude, .dryrun: .profile
        case .saved, .recentRoutes: .flights
        case .favorites: .favorites
        case .emergency: .emergency
        case .instructor, .routes, .procedures, .share, .file, .clearance, .radio, .recents, .map: nil
        }
    }

    /// The Do rows for what is typed, in order: the route its idents name;
    /// Direct To the field typed or found first, on a route; the screens
    /// whose name starts a word of what is typed, or that its words open;
    /// then the question for the assistant, always last.
    static func list(for typed: String, routed: Bool, firstIdent: String?) -> [SearchAction] {
        let words = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return [] }
        var rows: [SearchAction] = []
        let command = FieldCommands.read(words)
        if case .route(let dep, let stops, let dest) = command {
            rows.append(.route(dep: dep, stops: stops, dest: dest))
        }
        if routed {
            // One ident typed is the field itself; otherwise the first found.
            var ident = firstIdent
            if case .route(let dep, let stops, let dest) = command, dep == nil, stops.isEmpty { ident = dest }
            if let ident, !ident.isEmpty { rows.append(.directTo(ident)) }
        }
        var screens: [Screen] = []
        if case .open(let word) = command, let screen = screen(word) { screens.append(screen) }
        let lower = words.lowercased()
        screens += offered.filter { screen in
            let title = screen.title.lowercased()
            return title.hasPrefix(lower) || title.split(separator: " ").contains { $0.hasPrefix(lower) && lower.count >= 3 }
        }
        var seen = Set<Screen>()
        rows += screens.filter { seen.insert($0).inserted }.prefix(4).map(SearchAction.open)
        if lower.count >= 3, "show traffic".hasPrefix(lower) || "traffic".hasPrefix(lower) || lower.contains("traffic") { rows.append(.showTraffic) }
        rows.append(.ask(words))
        return rows
    }

    /// Each screen's glyph in the Do group, the concept table's where it has one.
    static func glyph(_ screen: Screen) -> String {
        switch screen {
        case .brief: WingtipIcon.brief
        case .navlog: WingtipIcon.navLog
        case .profile: WingtipIcon.profile
        case .nearest: WingtipIcon.nearest
        case .emergency: "exclamationmark.triangle"
        case .airplane, .airplanes: WingtipIcon.airplane
        case .setup: WingtipIcon.settings
        case .favorites: "star"
        case .flights: "tray.full"
        case .checklists: "checklist"
        case .logbook: "book"
        default: "arrow.forward.circle"
        }
    }
}
