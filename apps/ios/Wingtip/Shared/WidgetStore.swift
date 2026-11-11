import Foundation

/// What the app leaves in the App Group for the configurable widgets'
/// settings (WingtipWidgets: Next Flight, Home Airport Weather, Currency
/// Status), beside the next flight's snapshot (WidgetSnapshot): the
/// pilot's saved flights, for Next Flight's choice of flight, and their
/// home base and Favorites, offered first when they pick a field for its
/// weather. Compiled into the app and the extension, so both read one
/// shape; each list is written only as it changes.
enum WidgetStore {
    static let savedFlightsKey = "widgetSavedFlights"
    static let airportsKey = "widgetAirports"

    /// One saved flight as the widget offers and draws it: its name or
    /// route, the route, the nav log's totals as filed, and when it is
    /// planned for (the gateway's ISO 8601 day or instant), where it says.
    struct SavedFlight: Codable, Equatable, Sendable, Identifiable {
        var id: Int
        var title: String
        var dep: String
        var dest: String
        var stops: [String]
        var distanceNm: Double?
        var eteMin: Double?
        var fuelGal: Double?
        var plannedFor: String?
    }

    /// A field offered in the weather widget's settings: the home base
    /// first, then the Favorites, as the app keeps them.
    struct Airport: Codable, Equatable, Sendable, Identifiable {
        var ident: String
        var name: String
        var id: String { ident }
    }

    static func savedFlights(from store: UserDefaults? = WidgetSnapshot.store) -> [SavedFlight] {
        decoded([SavedFlight].self, store?.data(forKey: savedFlightsKey)) ?? []
    }

    static func airports(from store: UserDefaults? = WidgetSnapshot.store) -> [Airport] {
        decoded([Airport].self, store?.data(forKey: airportsKey)) ?? []
    }

    /// The list written where it differs from what is there; true when it
    /// did, so the caller reloads the widgets that read it.
    @discardableResult
    static func write(_ flights: [SavedFlight], to store: UserDefaults? = WidgetSnapshot.store) -> Bool {
        write(flights, savedFlightsKey, store, now: savedFlights(from: store))
    }

    @discardableResult
    static func write(_ airports: [Airport], to store: UserDefaults? = WidgetSnapshot.store) -> Bool {
        write(airports, airportsKey, store, now: Self.airports(from: store))
    }

    /// The pilot's own forgotten, as the app forgets them on signing out:
    /// the saved flights, the fields offered, the currency last read.
    static func forgetPilot(from store: UserDefaults? = WidgetSnapshot.store) {
        for key in [savedFlightsKey, airportsKey, currencyKey] { store?.removeObject(forKey: key) }
    }

    /// Where the Currency Status widget keeps its last answer.
    static let currencyKey = "widgetCurrency"

    private static func write<T: Codable & Equatable>(_ value: T, _ key: String, _ store: UserDefaults?, now: T) -> Bool {
        guard value != now, let data = try? JSONEncoder().encode(value) else { return false }
        store?.set(data, forKey: key)
        return true
    }

    private static func decoded<T: Decodable>(_ type: T.Type, _ data: Data?) -> T? {
        data.flatMap { try? JSONDecoder().decode(type, from: $0) }
    }
}
