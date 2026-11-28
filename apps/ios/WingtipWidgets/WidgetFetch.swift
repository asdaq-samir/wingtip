import Foundation
import GatewayAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import PlannerAPI

/// What the widgets ask for themselves, on their own timelines: a field's
/// weather from the planner (Home Airport Weather, and a saved flight's
/// departure in Next Flight), and the pilot's currency from the gateway
/// (Currency Status). Each through the gateway the app talks to (Config),
/// with the app's cookies from the Keychain the two share (SessionCookies), so the
/// currency is the signed-in pilot's. The last good answer is kept in the
/// App Group and shown, with its time, while a new one cannot be had.
/// Asked through the servers' generated clients (WingtipAPI's PlannerAPI
/// and GatewayAPI, swift-openapi-generator), as the app asks them, where
/// it decoded hand-written copies of their JSON; what is kept is the little each widget shows, read from
/// the generated answer.
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

    private static var transport: URLSessionTransport { URLSessionTransport(configuration: .init(session: session)) }
    private static let planner = PlannerAPI.Client(serverURL: Config.gateway, transport: transport, middlewares: [WidgetPlannerPath()])
    private static let gateway = GatewayAPI.Client(serverURL: Config.gateway, transport: transport)

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

        init(ident: String, name: String, metar: Report? = nil, taf: String? = nil, nearbyMetar: Nearby? = nil, fetchedAt: Date? = nil) {
            self.ident = ident; self.name = name; self.metar = metar; self.taf = taf; self.nearbyMetar = nearbyMetar; self.fetchedAt = fetchedAt
        }

        /// The planner's card (its generated AirportPlace), the few things shown.
        init(_ place: PlannerAPI.Components.Schemas.AirportPlace, at: Date) {
            func report(_ m: PlannerAPI.Components.Schemas.Metar) -> Report { Report(raw: m.raw, flightCategory: m.flightCategory, observedAt: m.observedAt) }
            self.init(ident: place.ident, name: place.name, metar: place.metar.map(report), taf: place.taf,
                      nearbyMetar: place.nearbyMetar.map { Nearby(ident: $0.ident, distanceNm: $0.distanceNm, near: $0.near, metar: report($0.metar)) },
                      fetchedAt: at)
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

        init(dayPassengersUntil: String? = nil, nightPassengersUntil: String? = nil, instrumentCurrentUntil: String? = nil, instrumentCurrentFrom: String? = nil,
             ipcNeededAfter: String? = nil, flightReviewUntil: String? = nil, medicalExpiresOn: String? = nil, fetchedAt: Date? = nil) {
            self.dayPassengersUntil = dayPassengersUntil; self.nightPassengersUntil = nightPassengersUntil
            self.instrumentCurrentUntil = instrumentCurrentUntil; self.instrumentCurrentFrom = instrumentCurrentFrom
            self.ipcNeededAfter = ipcNeededAfter; self.flightReviewUntil = flightReviewUntil
            self.medicalExpiresOn = medicalExpiresOn; self.fetchedAt = fetchedAt
        }

        /// The gateway's CurrencyDto (generated), the days shown.
        init(_ dto: GatewayAPI.Components.Schemas.CurrencyDto, at: Date) {
            self.init(dayPassengersUntil: dto.dayPassengersUntil, nightPassengersUntil: dto.nightPassengersUntil,
                      instrumentCurrentUntil: dto.instrumentCurrentUntil, instrumentCurrentFrom: dto.instrumentCurrentFrom,
                      ipcNeededAfter: dto.ipcNeededAfter, flightReviewUntil: dto.flightReviewUntil,
                      medicalExpiresOn: dto.medicalExpiresOn, fetchedAt: at)
        }
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
        if let place = try? await planner.airportPlace(path: .init(ident: ident)).ok.body.json {
            let weather = FieldWeather(place, at: Date())
            keep(weather, key)
            return .fresh(weather)
        }
        return kept(FieldWeather.self, key).map { .kept($0) } ?? .none
    }

    static func currency() async -> Answer<Currency> {
        let key = WidgetStore.currencyKey
        switch try? await gateway.currency() {
        case .ok(let ok):
            guard let dto = try? ok.body.json else { break }
            let currency = Currency(dto, at: Date())
            keep(currency, key)
            return .fresh(currency)
        case .undocumented(statusCode: let status, _) where status == 401 || status == 403:
            // Signed out: nothing of the last pilot's is shown.
            WidgetSnapshot.store?.removeObject(forKey: key)
            return .signedOut
        default:
            break
        }
        return kept(Currency.self, key).map { .kept($0) } ?? .none
    }

    private static func keep(_ value: some Encodable, _ key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        WidgetSnapshot.store?.set(data, forKey: key)
    }

    private static func kept<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        WidgetSnapshot.store?.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }
}

/// The planner's paths behind the gateway's proxy (Config.plannerPath), as
/// the app's PlannerPath middleware sends them.
private struct WidgetPlannerPath: ClientMiddleware {
    @concurrent
    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
                   next: @concurrent @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.path = request.path.map(Config.plannerPath)
        return try await next(request, body, baseURL)
    }
}
