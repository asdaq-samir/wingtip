import SwiftUI

/// A page of the sheet's one stack (PlanSheet), over the plan at its root:
/// a field's or a point's card, a screen by its name (design/screens.json),
/// a leg of the nav log, the route's own pages, and the account menu's
/// pages that have no link of their own. One typed path, so the map's ring
/// round the field whose card is up, a link and Siri all read and set it.
enum SheetPage: Hashable {
    /// A field's card, the airspace over a point, a list of fields or the
    /// fields near a town, as AirportRoute writes it.
    case airport(String)
    case screen(Screen)
    case leg(Leg)
    /// The route's own pages (RouteExtrasSection): the nearest fields for
    /// a diversion, the checkpoint notes, the filing, a procedure's fixes.
    case flight(String)
    /// NOTAMs in a list of their own: the route's, or one field's.
    case notams(NotamSource)
    case practice, training, instructing, contact

    /// The field or point whose card this is, for the map's ring.
    var airportRoute: String? {
        if case .airport(let text) = self { return text }
        return nil
    }

    /// The page as a scene keeps it (SceneStorage): a screen by its id, a
    /// card by its route; a leg or a route's page is not brought back,
    /// since the route it belongs to may not be.
    var stored: String? {
        switch self {
        case .airport(let text): "@" + text
        case .screen(let screen): screen.rawValue
        case .practice: "+practice"
        case .training: "+training"
        case .instructing: "+instructing"
        case .contact: "+contact"
        case .notams(.route): "+notams"
        case .notams(.field(let ident)): "+notams:" + ident
        case .leg, .flight: nil
        }
    }

    init?(stored: String) {
        if stored.hasPrefix("@") {
            let route = String(stored.dropFirst())
            guard !route.isEmpty else { return nil }
            self = .airport(route)
            return
        }
        switch stored {
        case "+practice": self = .practice
        case "+training": self = .training
        case "+instructing": self = .instructing
        case "+contact": self = .contact
        case "+notams": self = .notams(.route)
        case let text where text.hasPrefix("+notams:") && text.count > 8: self = .notams(.field(String(text.dropFirst(8))))
        default:
            guard let screen = Screen(rawValue: stored), Self.pushes(screen) else { return nil }
            self = .screen(screen)
        }
    }

    /// The pages written as a scene keeps them, one line.
    static func store(_ path: [SheetPage]) -> String {
        path.compactMap(\.stored).joined(separator: "\n")
    }

    static func restore(_ text: String?) -> [SheetPage] {
        (text ?? "").split(separator: "\n").compactMap { SheetPage(stored: String($0)) }
    }

    /// Whether a screen is a page pushed on the plan, rather than the plan
    /// itself, the search, a sheet of its own (Ask, the emergency
    /// assistant) or a preview a link carries (a shared flight).
    static func pushes(_ screen: Screen) -> Bool {
        switch screen {
        case .fpl, .airport, .ask, .emergency, .shared: false
        default: true
        }
    }
}

/// What each page of the sheet's stack draws, its close going back one
/// level (closesBack); a card grows out of the row it was opened from.
struct SheetPageView: View {
    let page: SheetPage
    let nearest: [NearestAirport]
    @Environment(Plan.self) private var plan

    var body: some View {
        switch page {
        case .airport(let text):
            AirportDestination(route: AirportRoute(text), nearest: nearest).closesBack().zoomsFrom(text)
        case .screen(let screen):
            ScreenPage(screen: screen, nearest: nearest).closesBack()
        case .leg(let leg):
            LegDetailView(leg: leg).closesBack().zoomsFrom(leg.id)
        case .flight(let name):
            FlightPage(name: name).closesBack()
        case .notams(let source): NotamListView(source: source).closesBack()
        case .practice: PracticeView().closesBack()
        case .training: TrainingView().closesBack()
        case .instructing: InstructorView().closesBack()
        case .contact: ContactView().closesBack()
        }
    }
}

/// A screen by its name as a page of the sheet: the one switch over the
/// generated list (Screen), so a screen added to design/screens.json fails
/// the build here until it has a page or a place.
struct ScreenPage: View {
    let screen: Screen
    let nearest: [NearestAirport]
    @Environment(Plan.self) private var plan

    var body: some View {
        switch screen {
        case .airplane: AircraftView()
        case .setup: SetupView()
        case .brief: BriefView()
        case .navlog: NavLogPage()
        case .profile: ProfileCard()
        case .flights: FlightsView()
        case .favorites: AirportListView(shows: .favorites, nearest: nearest)
        case .nearest: AirportListView(shows: .nearest, nearest: nearest)
        case .checklists: ChecklistsPage()
        case .airplanes: OwnAircraftListView()
        case .logbook: LogbookView()
        case .coach: CoachView()
        case .minimums: MinimumsView()
        case .guide: PilotGuideView()
        case .downloads: DownloadsView()
        case .passengers: PassengerBriefingView(flight: PassengerBriefingModel.flight(idents: plan.idents))
        case .about: AboutView()
        // Not pages (SheetPage.pushes): the plan is the root, the search
        // and Ask are the field's, the emergency assistant and a shared
        // flight are sheets of their own.
        case .fpl, .airport, .ask, .emergency, .shared: EmptyView()
        }
    }
}
