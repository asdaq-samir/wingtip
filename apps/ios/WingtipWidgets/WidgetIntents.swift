import AppIntents
import WidgetKit

// The configurable widgets' settings, App Intents' widget configuration
// (WidgetConfigurationIntent with AppIntentConfiguration, iOS 17 and up):
// what a long press, Edit Widget, offers for each. Every choice is read
// from the App Group (WidgetStore), so the settings answer with no signal.

/// A flight Next Flight can show: the plan on the app's page, or one of
/// the pilot's saved flights.
struct WidgetFlightChoice: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Flight"
    static let defaultQuery = WidgetFlightQuery()
    /// The plan on the page, the widget's first choice.
    static let onPage = WidgetFlightChoice(id: "plan", title: "Plan on the Page", route: nil)

    let id: String
    let title: String
    let route: String?

    /// The saved flight's id; nil for the plan on the page.
    var savedID: Int? { Int(id) }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: route.map { "\($0)" })
    }

    init(id: String, title: String, route: String?) {
        self.id = id
        self.title = title
        self.route = route
    }

    init(_ saved: WidgetStore.SavedFlight) {
        let route = ([saved.dep] + saved.stops + [saved.dest]).joined(separator: " → ")
        self.init(id: String(saved.id), title: saved.title, route: saved.title == route ? nil : route)
    }
}

struct WidgetFlightQuery: EntityQuery {
    func entities(for identifiers: [WidgetFlightChoice.ID]) async throws -> [WidgetFlightChoice] {
        Self.all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [WidgetFlightChoice] { Self.all() }

    func defaultResult() async -> WidgetFlightChoice? { .onPage }

    /// The plan on the page, then each saved flight as the app last listed them.
    static func all() -> [WidgetFlightChoice] {
        [.onPage] + WidgetStore.savedFlights().map(WidgetFlightChoice.init)
    }
}

struct NextFlightIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Next Flight"
    static let description = IntentDescription("Choose the flight to show: the plan on the page or a saved flight.")

    @Parameter(title: "Flight")
    var flight: WidgetFlightChoice?

    init() {}
}

/// A field whose weather the widget shows: the home base and Favorites
/// offered first, any ident typed taken as it is.
struct WidgetAirportChoice: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Airport"
    static let defaultQuery = WidgetAirportQuery()

    /// The ident as pilots write it: KMSN, 3CK.
    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(id)", subtitle: name.isEmpty || name == id ? nil : "\(name)")
    }
}

struct WidgetAirportQuery: EntityStringQuery {
    func entities(for identifiers: [WidgetAirportChoice.ID]) async throws -> [WidgetAirportChoice] {
        identifiers.compactMap { ident in Self.offered().first { $0.id == ident } ?? Self.ident(ident).map { WidgetAirportChoice(id: $0, name: "") } }
    }

    /// The offered fields whose ident or name has what was typed, and the
    /// typed ident itself where it could be one and is not among them.
    func entities(matching string: String) async throws -> [WidgetAirportChoice] {
        let found = Self.offered().filter { $0.id.contains(string.uppercased()) || $0.name.localizedCaseInsensitiveContains(string) }
        guard let typed = Self.ident(string), !found.contains(where: { $0.id == typed }) else { return found }
        return [WidgetAirportChoice(id: typed, name: "")] + found
    }

    func suggestedEntities() async throws -> [WidgetAirportChoice] { Self.offered() }

    /// The home base, where the pilot gave one; none otherwise: no field is
    /// assumed, and the widget asks for one.
    func defaultResult() async -> WidgetAirportChoice? { Self.offered().first }

    static func offered() -> [WidgetAirportChoice] {
        WidgetStore.airports().map { WidgetAirportChoice(id: $0.ident, name: $0.name) }
    }

    /// An ident as the planner takes one: 3 or 4 letters and figures, upper case.
    static func ident(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespaces).uppercased()
        guard (3...4).contains(text.count), text.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { return nil }
        return text
    }
}

struct AirportWeatherIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Airport Weather"
    static let description = IntentDescription("Choose the airport whose METAR and TAF the widget shows.")

    @Parameter(title: "Airport")
    var airport: WidgetAirportChoice?

    init() {}
}

/// Which of the pilot's currencies the small widget and the Lock Screen
/// show; the medium widget shows them all.
enum CurrencyItem: String, AppEnum, CaseIterable {
    case dayPassengers, nightPassengers, instrument, flightReview, medical

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Currency"
    static let caseDisplayRepresentations: [CurrencyItem: DisplayRepresentation] = [
        .dayPassengers: "Passengers by Day",
        .nightPassengers: "Passengers at Night",
        .instrument: "Instrument",
        .flightReview: "Flight Review",
        .medical: "Medical",
    ]
}

struct CurrencyIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Currency Status"
    static let description = IntentDescription("Choose the currency the small widget shows.")

    @Parameter(title: "Show", default: .dayPassengers)
    var item: CurrencyItem

    init() {}
}
