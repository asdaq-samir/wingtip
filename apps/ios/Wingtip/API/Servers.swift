import Foundation
import GatewayAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import PlannerAPI

/// The servers' clients, generated from their OpenAPI documents by
/// swift-openapi-generator (scripts/build/api-models-apps.sh, the
/// WingtipAPI modules), each sent through URLSession with the gateway's
/// cookie jar and cache (Gateway.session). What the app adds to every call
/// is a middleware here: the planner's paths behind the
/// gateway's proxy, the CSRF token, the session's cookies kept, and a
/// refusal thrown in the server's own words.
enum Servers {
    /// How long a call waits, each its own URLSession over the one jar and
    /// cache, as a URLRequest's own wait cannot be set through the client.
    enum Wait: Sendable, CaseIterable {
        /// URLSession's own: a minute with no byte.
        case usual
        /// A call made in the air: the whole call bound by
        /// Planner.inFlight, however its bytes trickle in, so the packs
        /// answer in its place (timeoutIntervalForResource).
        case inFlight
        /// A read the pilot is waiting on: Planner.read with no byte, so a
        /// nav log streaming its stages is not cut off.
        case read
        /// A large body sent (a photo, a logbook): Planner.upload.
        case upload
    }

    /// The session a wait is made on: the gateway's own, or one with its
    /// settings and the wait set.
    static func session(_ wait: Wait) -> URLSession {
        guard wait != .usual else { return Gateway.session }
        let config = Gateway.configuration()
        switch wait {
        case .inFlight: config.timeoutIntervalForResource = Planner.inFlight
        case .read: config.timeoutIntervalForRequest = Planner.read
        case .upload: config.timeoutIntervalForRequest = Planner.upload
        case .usual: break
        }
        return URLSession(configuration: config)
    }

    static let sessions: [Wait: URLSession] = Dictionary(uniqueKeysWithValues: Wait.allCases.map { ($0, session($0)) })

    /// The generated clients' settings: a body's keys sorted, so the same
    /// question is the same bytes (the Go / No-Go's key).
    static let configuration = Configuration(jsonEncodingOptions: [.sortedKeys])

    static func transport(_ wait: Wait) -> URLSessionTransport {
        URLSessionTransport(configuration: .init(session: sessions[wait] ?? Gateway.session))
    }

    /// A call's answer, or the error under the generated client's own:
    /// the planner's refusal, the gateway's, or URLSession's (no
    /// connection, timed out), as the screens tell them apart.
    nonisolated(nonsending) static func unwrapped<C: Sendable, T>(_ client: C, _ call: (C) async throws -> T) async throws -> T {
        do {
            return try await call(client)
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }
}

extension Planner {
    /// The planner's client for a wait, through the gateway's proxy.
    static let clients: [Servers.Wait: PlannerAPI.Client] = Dictionary(uniqueKeysWithValues: Servers.Wait.allCases.map {
        ($0, PlannerAPI.Client(serverURL: Config.gateway, configuration: Servers.configuration, transport: Servers.transport($0),
                               middlewares: [PlannerPath(), CSRF(), Refusals(gateway: false)]))
    })

    /// One of the planner's calls, made with the generated client.
    nonisolated(nonsending) static func call<T>(_ wait: Servers.Wait = .usual, _ call: (PlannerAPI.Client) async throws -> T) async throws -> T {
        try await Servers.unwrapped(clients[wait]!, call)
    }

    /// An answer streamed a line at a time (newline-delimited JSON: the
    /// nav log), each line read by `decode`; nil skips a line.
    static func lines<T: Sendable>(_ body: @escaping @Sendable () async throws -> HTTPBody,
                                   _ decode: @escaping @Sendable (Data) throws -> T?) -> AsyncThrowingStream<T, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await line in JSONLinesDeserializationSequence(upstream: try await body()) where !line.isEmpty {
                        if let value = try decode(Data(line)) { continuation.yield(value) }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

extension Gateway {
    static let clients: [Servers.Wait: GatewayAPI.Client] = Dictionary(uniqueKeysWithValues: Servers.Wait.allCases.map {
        ($0, GatewayAPI.Client(serverURL: Config.gateway, configuration: Servers.configuration, transport: Servers.transport($0),
                               middlewares: [CSRF(), Refusals(gateway: true)]))
    })

    /// One of the gateway's calls, made with the generated client.
    nonisolated(nonsending) static func call<T>(_ wait: Servers.Wait = .usual, _ call: (GatewayAPI.Client) async throws -> T) async throws -> T {
        try await Servers.unwrapped(clients[wait]!, call)
    }

    /// A read that is nobody's when signed out: nil where the gateway
    /// refuses it with a status in `none` (401 and 403 unless a call says
    /// otherwise).
    nonisolated(nonsending) static func read<T>(none: Set<Int> = [401, 403], _ call: (GatewayAPI.Client) async throws -> T?) async throws -> T? {
        do {
            return try await Servers.unwrapped(clients[.usual]!, call)
        } catch let refusal as GatewayRefusal where none.contains(refusal.status) {
            return nil
        }
    }
}

/// The planner's operation paths are `/api/…`; through the gateway's proxy
/// they are `/api/planner/…` (Config.plannerPath).
struct PlannerPath: ClientMiddleware {
    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
                   next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.path = request.path.map(Config.plannerPath)
        return try await next(request, body, baseURL)
    }
}

/// Spring Security's CSRF check (SecurityConfig): every POST, PUT, PATCH
/// and DELETE echoes the XSRF-TOKEN cookie the gateway set in a header, as
/// the web app's client does. The cookie is written on any of the
/// gateway's answers once asked for: one GET first where there is none yet.
struct CSRF: ClientMiddleware {
    static let header = HTTPField.Name("X-XSRF-TOKEN")!

    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
                   next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if request.method != .get, request.method != .head {
            if Gateway.csrfToken == nil { _ = try? await Gateway.me() }
            if let token = Gateway.csrfToken { request.headerFields[Self.header] = token }
        }
        return try await next(request, body, baseURL)
    }
}

/// Every answer's cookies kept (a sign-in, a renewed session, a sign-out),
/// and an answer of 400 or more thrown in the server's own words: the
/// planner's FastAPI `detail` (Planner.Failure), the gateway's
/// ErrorResponse (GatewayRefusal). The path names the call (an ident in it
/// is public); the query may hold a position and is left out of the log.
struct Refusals: ClientMiddleware {
    let gateway: Bool

    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
                   next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, answer) = try await next(request, body, baseURL)
        SessionCookies.keep()
        let status = response.status.code
        guard status >= 400 else { return (response, answer) }
        var data = Data()
        if let answer { data = try await Data(collecting: answer, upTo: 1 << 20) }
        let path = request.path?.split(separator: "?").first.map(String.init) ?? ""
        Log.planner.error("\(path, privacy: .public) answered \(status)")
        if gateway { throw GatewayRefusal(status: status, words: GatewayRefusal.words(in: data)) }
        throw Planner.Failure(status: status, detail: Planner.detail(of: data))
    }
}

extension OpenAPIValueContainer {
    /// A number however the JSON wrote it: the runtime reads 42 as an Int
    /// and 42.5 as a Double.
    var number: Double? { (value as? Double) ?? (value as? Int).map(Double.init) }

    /// A number as a member of an untyped object (the engine's and the
    /// servers' open members).
    init(number: Double) { self.init(floatLiteral: number) }
}
