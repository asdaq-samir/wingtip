import SwiftUI

/// A card or a page (Navigator): a thing -- a field's or a point's card,
/// an airplane in traffic or by its N-number, a leg of the route, a hold,
/// a flown track, the Map settings -- or a page by its name
/// (design/screens.json), the route's own pages, and Settings' pages that
/// have no link of their own. One typed path, so the map's ring round the
/// field whose card is up, a link and Siri all read and set it, and each
/// is drawn by one view wherever it is opened from (SheetPageView).
enum SheetPage: Hashable {
    /// A field's card, the airspace over a point, a list of fields or the
    /// fields near a town, as AirportRoute writes it.
    case airport(String)
    case screen(Screen)
    /// A leg of the route by its index on the map's line, the one Route
    /// Leg card from the nav log's row and the map's course alike.
    case leg(Int)
    /// The route's own pages (RouteExtrasSection): the checkpoint notes,
    /// the filing, a procedure's fixes.
    case flight(String)
    /// NOTAMs in a list of their own: the route's, or one field's.
    case notams(NotamSource)
    case practice, training, instructing, contact
    /// An airplane in the air, by its ICAO address: its card, tracked.
    case traffic(String)
    /// An airplane's profile by its N-number, the one profile card
    /// wherever an N-number or a figure of it is tapped.
    case tail(ProfileAsk)
    /// A hold at a point of the route, set or changed (an edit form).
    case hold(String)
    /// A saved flight's flown track and its replay.
    case flown(Int, String)
    /// The assistant, with the question the search sent where there is one.
    case ask(String?)
    /// The Map card, the map's own button's: what is on the map (as Maps'
    /// Choose Map card).
    case mapSettings
    /// The app's Settings, pushed from You's gear or the Map card's, at its
    /// Map group from the Map card's (docs/design/rules.md §8).
    case settings(atMap: Bool)
    /// An approach plate on the map, by its key ("KOSH:I36"): its card's
    /// Hide Plate, View Full Screen and how the page is drawn (PlateCard).
    case plate(String)
    /// The clearance heard or typed into the route.
    case clearance
    /// A flight another pilot sent, and the flight just ended to log:
    /// each a card of its own.
    case sharedFlight, flightLogged
    /// A TFR's card by its FDC NOTAM number ("6/4116"), from a tap on it
    /// or its link (`tfr=`).
    case tfr(String)
    /// A VOR's card by its key ("OBK@42.2214,-87.9517", NavaidKey), from a
    /// tap on its mark or its link (`navaid=`).
    case navaid(String)
    /// The emergency assistant: a card like every other (the owner,
    /// 2026-11-13: "For phones, just do it natively, but stay
    /// consistent"), the one that opens at full height. Opened by its
    /// model (Emergency.open, CardTriggers), never kept by a scene.
    case emergency

    /// The field or point whose card this is, for the map's ring.
    var airportRoute: String? {
        if case .airport(let text) = self { return text }
        return nil
    }

    /// A thing, the iPad's inspector's beside the map, as Maps opens a
    /// place there: a field's card or the airspace over a point, the
    /// Brief, the profile and the saved flights, and the flight's own
    /// cards. The other pages stay in the sidebar, where they were opened.
    var inspects: Bool {
        switch self {
        case .airport(let text): RootLayout.inspects(AirportRoute(text))
        case .screen(let screen): [.brief, .profile, .flights].contains(screen)
        case .traffic, .tail, .hold, .flown, .leg, .ask, .mapSettings, .plate, .clearance, .sharedFlight, .flightLogged, .emergency, .tfr, .navaid: true
        case .flight, .notams, .practice, .training, .instructing, .contact, .settings: false
        }
    }

    /// Opened full height: the emergency assistant alone. Every other card
    /// opens half way, the map in sight above it, as Maps opens a place,
    /// and the pilot's drag chooses its size from there (the card rule's
    /// 2, the owner, 2026-11-11: "I thought stock was to open each card
    /// medium by default").
    var opensFull: Bool { self == .emergency }

    /// A settings card, You (Settings in it) and the Map card: a swipe down
    /// closes it rather than parking it at the pill, as Apple Maps
    /// dismisses its account and settings sheets while a place stays at
    /// hand (the owner, 2026-11-14: "Apple Maps closes all setting drawers
    /// on swipe down"; docs/design/rules.md, card rule 10).
    var swipeCloses: Bool {
        switch self {
        case .mapSettings, .settings, .screen(.setup): true
        default: false
        }
    }

    /// The sizes the card's sheet stops at on the iPhone. A content card
    /// parks at the pill on a swipe down, its bar in sight there, and a
    /// drag past the pill leaves it there (CardHost); a settings card has
    /// no pill, so from all the way up a swipe brings it to half, the
    /// system's next detent, and from half closes it (the owner,
    /// 2026-11-14: "Settings cards should only close from a swipe down
    /// when in medium detents"); Emergency keeps the pill out too and is
    /// closed by its ✕ alone.
    var detents: Set<PresentationDetent> {
        swipeCloses || self == .emergency ? [.half, .large] : [RootView.pill, .half, .large]
    }

    /// Whether the page brings its own way out (an edit form's Cancel, a
    /// question's Not Now), so the card adds no close of its own: HIG
    /// Sheets puts Cancel where the close would be.
    var ownClose: Bool {
        switch self {
        case .hold, .clearance, .sharedFlight, .flightLogged: true
        default: false
        }
    }

    /// The card's handle for the UI tests (CardRuleTests): one per kind,
    /// the same whichever way it was opened.
    var testID: String {
        switch self {
        case .airport(let text):
            switch AirportRoute(text) {
            case .airport: "card-airport"
            case .airspace: "card-airspace"
            case .list(.nearest): "card-nearest"
            case .list, .nearFrom, .nearby: "card-list"
            }
        case .screen(let screen): "card-\(screen.rawValue)"
        case .leg: "card-leg"
        case .flight: "card-flight"
        case .notams: "card-notams"
        case .practice: "card-practice"
        case .training: "card-training"
        case .instructing: "card-instructing"
        case .contact: "card-contact"
        case .traffic: "card-traffic"
        case .tail: "card-tail"
        case .hold: "card-hold"
        case .flown: "card-flown"
        case .ask: "card-ask"
        case .mapSettings: "card-map"
        case .settings: "card-settings"
        case .plate: "card-plate"
        case .clearance: "card-clearance"
        case .sharedFlight: "card-shared"
        case .flightLogged: "card-logged"
        case .emergency: "card-emergency"
        case .tfr: "card-tfr"
        case .navaid: "card-navaid"
        }
    }

    /// The page as a scene keeps it (SceneStorage): a screen by its id, a
    /// card by its route; a leg, a route's page or a flight's card is not
    /// brought back, since the route or the flight it belongs to may not be.
    var stored: String? {
        switch self {
        case .airport(let text): "@" + text
        case .screen(let screen): screen.rawValue
        case .practice: "+practice"
        case .training: "+training"
        case .instructing: "+instructing"
        case .contact: "+contact"
        case .mapSettings: "+map"
        case .settings: "+settings"
        case .plate(let key): "+plate:" + key
        case .notams(.route): "+notams"
        case .notams(.field(let ident)): "+notams:" + ident
        case .leg, .flight, .traffic, .tail, .hold, .flown, .ask, .clearance, .sharedFlight, .flightLogged, .emergency, .tfr, .navaid: nil
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
        case "+map": self = .mapSettings
        case "+settings": self = .settings(atMap: false)
        // Never kept (stored is nil), but opened by the UI tests' `-card`.
        case "+clearance": self = .clearance
        case "+notams": self = .notams(.route)
        case let text where text.hasPrefix("+plate:") && PlateKey.parts(String(text.dropFirst(7))) != nil: self = .plate(String(text.dropFirst(7)))
        case let text where text.hasPrefix("+notams:") && text.count > 8: self = .notams(.field(String(text.dropFirst(8))))
        default:
            guard let screen = Screen(rawValue: stored), Self.pages(screen) else { return nil }
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

    /// Whether a screen is a page of its own, rather than the plan itself,
    /// the search, Ask (a card by its question), the emergency assistant
    /// (a card its model opens) or a preview a link carries (a shared flight).
    static func pages(_ screen: Screen) -> Bool {
        switch screen {
        case .fpl, .airport, .ask, .emergency, .shared: false
        default: true
        }
    }
}

/// What each page draws, wherever it is opened from: the root of a card
/// or pushed inside one, the system's Back going back one level. No zoom
/// from the row: inside a resizable sheet the zoom's own pull-down popped
/// the page where the pilot meant to lower the sheet (the owner's
/// scrolling rule, 2026-11-10), so a page pushes and a card rises.
struct SheetPageView: View {
    let page: SheetPage
    let nearest: [NearestAirport]

    var body: some View {
        content
            // One container per card, by its kind, for the UI tests.
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(page.testID)
    }

    @ViewBuilder private var content: some View {
        switch page {
        case .airport(let text):
            AirportDestination(route: AirportRoute(text), nearest: nearest)
        case .screen(let screen):
            ScreenPage(screen: screen, nearest: nearest)
        case .leg(let index):
            RouteLegView(index: index)
        case .flight(let name):
            FlightPage(name: name)
        case .notams(let source): NotamListView(source: source)
        case .practice: PracticeView()
        case .training: TrainingView()
        case .instructing: InstructorView()
        case .contact: ContactView()
        case .traffic(let hex): AirplaneCard(hex: hex).id(hex)
        case .tail(let asked): AirplaneProfileView(tail: asked.tail, focus: asked.focus).id(asked)
        case .hold(let fix): HoldSheet(fix: fix).id(fix)
        case .flown(let id, let title): FlownTrackView(flight: id, title: title).id(id)
        case .ask(let question): AskView(first: question)
        case .mapSettings: MapSettingsView()
        case .settings(let atMap): SettingsView(atMap: atMap)
        case .plate(let key): PlateCard(key: key).id(key)
        case .clearance: ClearanceSheet()
        case .sharedFlight: SharedFlightView()
        case .flightLogged: FlightLoggedCard()
        case .emergency: EmergencyCard()
        case .tfr(let id): TfrCard(notamId: id).id(id)
        case .navaid(let key): NavaidCard(key: key).id(key)
        }
    }
}

/// A screen by its name as a page: the one switch over the generated list
/// (Screen), so a screen added to design/screens.json fails the build
/// here until it has a page or a place.
struct ScreenPage: View {
    let screen: Screen
    let nearest: [NearestAirport]
    @Environment(Plan.self) private var plan

    var body: some View {
        switch screen {
        case .airplane: AircraftView()
        case .setup: YouView()
        case .brief: BriefView()
        case .navlog: NavLogPage()
        case .profile: ProfileCard()
        case .flights: FlightsView()
        case .favorites: AirportListView(shows: .favorites, nearest: nearest)
        // The one Nearest list, wherever it is opened from: the search,
        // the instruments bar, the plan's In Flight row, Siri.
        case .nearest: NearestView()
        case .checklists: ChecklistsPage()
        case .airplanes: OwnAircraftListView()
        case .logbook: LogbookView()
        case .coach: CoachView()
        case .minimums: MinimumsView()
        case .guide: PilotGuideView()
        case .downloads: DownloadsView()
        case .passengers: PassengerBriefingView(flight: PassengerBriefingModel.flight(idents: plan.idents))
        case .about: AboutView()
        // Not pages (SheetPage.pages): the plan is the root, the search
        // is the field's, Ask is a card by its question, the emergency
        // assistant is its model's card and a shared flight is its own card.
        case .fpl, .airport, .ask, .emergency, .shared: EmptyView()
        }
    }
}
