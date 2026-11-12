import Foundation

/// The pilot, as the gateway knows them (PilotDto, generated).
typealias Pilot = GWPilotDto

/// The gateway, through its generated client (GatewayAPI, Servers.swift)
/// under the names the app calls it by. URLSession keeps the session
/// cookie the gateway sets, so a call made after signing in is the
/// pilot's, as in Safari.
enum Gateway {
    /// The settings every call's session shares: the one cookie jar and
    /// the one cache (Servers.Wait makes a session of each wait from them).
    static func configuration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        // Kept in the Keychain (SessionCookies), shared with the Currency
        // Status widget so it reads the gateway as the signed-in pilot.
        config.httpCookieStorage = SessionCookies.jar
        // A cache of the answers the gateway and the planner say may be
        // kept (Cache-Control: the chart's tiles for a cycle, the fields and
        // airspace of a box, a field's card for minutes), so a view come
        // back to is answered from the phone, and an answer with an ETag
        // is revalidated in one short round trip. The default configuration
        // had no cache at all: every pan and every card was a full fetch
        // (the owner's ask for speed, 2026-11-03). Sized for a flight's
        // worth of tiles and answers; the protocol's own policy, so an
        // answer marked no-store is never kept.
        config.urlCache = answers
        config.requestCachePolicy = .useProtocolCachePolicy
        return config
    }

    static let answers = URLCache(memoryCapacity: 32 << 20, diskCapacity: 256 << 20, diskPath: "wingtip-answers")

    static let session = URLSession(configuration: configuration())

    /// The gateway's CSRF token, from the cookie it sets on every answer.
    static var csrfToken: String? {
        SessionCookies.jar.cookies(for: Config.gateway)?.first { $0.name == "XSRF-TOKEN" }?.value
    }

    /// The pilot signed in, or nil (the gateway's 204) when no one is.
    static func me() async throws -> Pilot? {
        try await read(none: [401]) {
            switch try await $0.me() {
            case .ok(let ok): try ok.body.json
            default: nil
            }
        }
    }

    /// Apple's identity token from the system's sheet, checked by the
    /// gateway against this app's bundle id (AppleNativeSignInController).
    static func signInWithApple(identityToken: String, nonce: String?) async throws {
        _ = try await call { try await $0.signIn(body: .json(GWAppleToken(identityToken: identityToken, nonce: nonce))).ok }
    }

    /// A nonce for one Sign in with Apple attempt, issued to this session
    /// and spent by it (AppleNativeSignInController, the security audit's
    /// L5): its SHA-256 goes into Apple's request, so a leaked identity
    /// token cannot be replayed on another session.
    static func appleNonce() async throws -> String {
        try await call { try await $0.nonce().ok.body.json.nonce }
    }

    /// A sign-in link emailed to the pilot; the gateway answers 202
    /// whether or not the address is known.
    static func requestMagicLink(email: String) async throws {
        _ = try await call { try await $0.request(body: .json(GWMagicLinkRequest(email: email))) }
    }

    /// Whose account a sign-in link is for, before the pilot says yes
    /// (MagicLinkAccountController, the security audit's M1): the address
    /// masked ("a•••@icloud.com"), nothing spent. 404 is a used, expired or
    /// unknown link alike; 429 the hour's asks used up.
    enum LinkAccount: Equatable, Sendable {
        case email(String)
        case expired
        case tooMany
    }

    static func linkAccount(token: String) async throws -> LinkAccount {
        do {
            return .email(try await call { try await $0.account(body: .urlEncodedForm(.init(token: token))).ok.body.json.email })
        } catch let refusal as GatewayRefusal where refusal.status == 404 {
            return .expired
        } catch let refusal as GatewayRefusal where refusal.status == 429 {
            return .tooMany
        }
    }

    /// The link's one-time token, posted as the website's page posts it.
    static func verifyMagicLink(token: String) async throws {
        _ = try await call { try await $0.verify(body: .urlEncodedForm(.init(token: token))) }
    }

    /// Spring Security's own logout, which answers 204: not one of the
    /// document's operations, so asked of the session itself, with the
    /// CSRF token every POST carries.
    static func signOut() async throws {
        var request = URLRequest(url: Config.gateway.appending(path: "/logout"))
        request.httpMethod = "POST"
        if let token = csrfToken { request.setValue(token, forHTTPHeaderField: CSRF.header.rawName) }
        _ = try await session.data(for: request)
        SessionCookies.keep()
    }
}

/// The gateway's own words for a refusal: Spring's ProblemDetail (RFC
/// 9457), its `detail` ("Invalid request: email: must be a well-formed
/// email address", each broken field named), or its `errors` one by one
/// where it has no detail. The old ErrorResponse's `error` and `details`
/// are read too, until the planner's and the assistant's refusals are
/// checked for the same shape.
struct GatewayRefusal: Error, LocalizedError, Equatable {
    let status: Int
    let words: String?
    var errorDescription: String? { words ?? "The server answered \(status)." }

    static func words(in data: Data) -> String? {
        struct Body: Decodable { var detail: String?; var errors: [String]?; var error: String?; var details: [String]? }
        guard let body = try? JSONDecoder().decode(Body.self, from: data) else { return nil }
        if let detail = body.detail, !detail.isEmpty { return detail }
        if let errors = body.errors, !errors.isEmpty { return errors.joined(separator: "; ") }
        guard let error = body.error else { return nil }
        let details = body.details ?? []
        return details.isEmpty ? error : "\(error): \(details.joined(separator: "; "))"
    }
}
