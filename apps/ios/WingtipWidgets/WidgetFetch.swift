import Foundation

/// What the widgets ask for themselves, on their own timelines: a field's
/// weather from the planner (Home Airport Weather, and a saved flight's
/// departure in Next Flight), and the pilot's currency from the gateway
/// (Currency Status). Each through the gateway the app talks to (Config),
/// with the app's cookies from the Keychain the two share (SessionCookies), so the
/// currency is the signed-in pilot's. The last good answer is kept in the
/// App Group and shown, with its time, while a new one cannot be had.
enum WidgetFetch {
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = SessionCookies.jar
        config.httpShouldSetCookies = true
        // A widget's timeline is given seconds, not a minute: a slow
        // answer gives way to the one kept.
        config.timeoutIntervalForRequest = 15
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    /// A field's weather as the planner's card has it (/api/airport/{ident},
    /// public): its name, its METAR as sent with the flight category the
    /// planner gives it, and its TAF as issued; a field with no report of
    /// its own its nearest one within 10 statute miles (NearbyMetar.near).
    struct FieldWeather: Codable, Equatable, Sendable {
        var ident: String
        var name: String
        var metar: Report?
        var taf: String?
        var nearbyMetar: Nearby?
        /// When the widget had this answer.
        var fetchedAt: Date?

        struct Report: Codable, Equatable, Sendable {
            var raw: String?
            var flightCategory: String?
            var observedAt: String?
        }

        struct Nearby: Codable, Equatable, Sendable {
            var ident: String
            var distanceNm: Double
            var near: Bool
            var metar: Report
        }

        /// The report said of the field: its own, else one near enough.
        var report: Report? { metar ?? (nearbyMetar?.near == true ? nearbyMetar?.metar : nil) }
        /// The station the report is from where it is not the field's own.
        var reportFrom: String? { metar == nil && nearbyMetar?.near == true ? nearbyMetar?.ident : nil }
    }

    /// The pilot's currency as the gateway works it out (CurrencyDto,
    /// GET /api/logbook/currency): the last day of each, as the gateway's
    /// days ("2026-12-03"); nil where it cannot be had.
    struct Currency: Codable, Equatable, Sendable {
        var dayPassengersUntil: String?
        var nightPassengersUntil: String?
        var instrumentCurrentUntil: String?
        var instrumentCurrentFrom: String?
        var ipcNeededAfter: String?
        var flightReviewUntil: String?
        var medicalExpiresOn: String?
        var fetchedAt: Date?
    }

    enum Answer<T: Sendable>: Sendable {
        case fresh(T)
        /// The last good answer, kept, where a new one could not be had.
        case kept(T)
        /// The gateway answered that no one is signed in.
        case signedOut
        case none
    }

    static func weather(_ ident: String) async -> Answer<FieldWeather> {
        let key = "widgetWeather.\(ident)"
        let url = Config.gateway.appending(path: Config.plannerPath("/api/airport/\(ident)"))
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        if case .ok(let data) = await get(url), var weather = try? decoder.decode(FieldWeather.self, from: data) {
            weather.fetchedAt = Date()
            keep(weather, key)
            return .fresh(weather)
        }
        return kept(FieldWeather.self, key).map { .kept($0) } ?? .none
    }

    static func currency() async -> Answer<Currency> {
        let key = WidgetStore.currencyKey
        switch await get(Config.gateway.appending(path: "/api/logbook/currency")) {
        case .ok(let data):
            guard var currency = try? JSONDecoder().decode(Currency.self, from: data) else { break }
            currency.fetchedAt = Date()
            keep(currency, key)
            return .fresh(currency)
        case .signedOut:
            // Signed out: nothing of the last pilot's is shown.
            WidgetSnapshot.store?.removeObject(forKey: key)
            return .signedOut
        case .failed:
            break
        }
        return kept(Currency.self, key).map { .kept($0) } ?? .none
    }

    private enum Got { case ok(Data), signedOut, failed }

    private static func get(_ url: URL) async -> Got {
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await session.data(for: request) else { return .failed }
        switch (response as? HTTPURLResponse)?.statusCode ?? 0 {
        case 200: return .ok(data)
        case 401, 403: return .signedOut
        default: return .failed
        }
    }

    private static func keep(_ value: some Encodable, _ key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        WidgetSnapshot.store?.set(data, forKey: key)
    }

    private static func kept<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        WidgetSnapshot.store?.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }
}
