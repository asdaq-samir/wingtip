import CryptoKit
import Foundation
import Observation

/// Who is signed in, and the ways in: Sign in with Apple through iOS's
/// own sheet, or the emailed link, which opens the app. The gateway's
/// session cookie, kept by URLSession, is the sign-in itself.
@MainActor
@Observable
final class Session {
    private(set) var pilot: Pilot?
    private(set) var loaded = false
    var problem: String?
    /// The flight (FlightSession) whose records signing out and deleting
    /// the account forget too: the app gives it (WingtipApp); a preview's
    /// or a test's session has none, and forgets the same stores' records.
    @ObservationIgnored var flight: FlightSession?

    var signedIn: Bool { pilot != nil }

    /// Asks the gateway who is signed in: at launch, and after any sign-in.
    func refresh() async {
        do {
            pilot = try await Gateway.me()
            problem = nil
        } catch {
            // Offline, or the gateway down: the last answer stands, and
            // the chart is still the pilot's from its cache.
            problem = error.localizedDescription
            Log.app.notice("who is signed in could not be asked: \(error.localizedDescription, privacy: .public)")
        }
        loaded = true
    }

    /// The nonce for the next Sign in with Apple, asked as the sign-in
    /// page opens (Apple's request is made synchronously, so it must be in
    /// hand) and again after each attempt, which spends it. Nil where it
    /// could not be asked: the gateway takes a token without one until the
    /// owner sets APP_APPLE_REQUIRE_NONCE (docs/NATIVE.md).
    private(set) var appleNonce: String?

    func prepareAppleNonce() async {
        appleNonce = try? await Gateway.appleNonce()
    }

    /// What Apple's request carries for a nonce: its SHA-256 as lowercase
    /// hex, which Apple writes into the token's `nonce` claim and the
    /// gateway checks against the nonce itself (docs/NATIVE.md).
    nonisolated static func hashedNonce(_ nonce: String) -> String {
        SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func signInWithApple(identityToken: String, nonce: String?) async {
        defer { Task { await prepareAppleNonce() } }
        do {
            try await Gateway.signInWithApple(identityToken: identityToken, nonce: nonce)
            await refresh()
        } catch {
            problem = "Apple's sign-in was not accepted: \(error.localizedDescription)"
            Log.app.error("Sign in with Apple refused: \(error.localizedDescription, privacy: .public)")
        }
    }

    func requestMagicLink(email: String) async -> Bool {
        do {
            try await Gateway.requestMagicLink(email: email)
            problem = nil
            return true
        } catch {
            problem = "The link could not be sent: \(error.localizedDescription)"
            return false
        }
    }

    /// A sign-in link waiting on the pilot's yes (LinkSignInPrompt): set
    /// by `open`, spent by `confirmLink`, dropped by `cancelLink`.
    private(set) var pendingLink: PendingLink?
    /// Who a link signed the pilot in as, said once so a link that was not
    /// theirs is seen and undone at once ("That's Not Me").
    var signedInByLink: String?

    /// How a link's account is asked (Gateway.linkAccount), or a test's.
    @ObservationIgnored var askLinkAccount: @Sendable (String) async throws -> Gateway.LinkAccount = { try await Gateway.linkAccount(token: $0) }

    /// A sign-in link's token, whose account it is and who it would sign
    /// out, named in the ask.
    struct PendingLink: Equatable, Identifiable {
        let token: String
        /// The account signed in now, which the link's would replace.
        let replacing: String?
        /// Whose the link is, as the gateway masks it; nil where it could
        /// not be asked (offline), and the ask then says only to open your own.
        var account: Gateway.LinkAccount?
        var id: String { token }
        /// A link that can no longer sign in, or can't be asked about this
        /// hour: no Sign In is offered.
        var usable: Bool { account != .expired && account != .tooMany }
    }

    /// A link opened in the app: only the emailed sign-in link, https on
    /// this build's own gateway, is taken, and only as a question. Opening
    /// it signs nobody in, as the web's LinkSignIn does not: an attacker's
    /// link for their own account (the custom scheme, or another host)
    /// would otherwise put this pilot's records into it (security audit
    /// 2026-11-10, M1).
    func open(_ url: URL) async {
        guard let token = Self.signInToken(url) else { return }
        // Whose account it is, asked before the question is put, so the
        // pilot sees the address before tapping Sign In; nothing is spent.
        let account = try? await askLinkAccount(token)
        pendingLink = PendingLink(token: token, replacing: pilot?.email, account: account)
    }

    /// The token of an emailed sign-in link, or nil for anything else:
    /// https only, on `host` (Config.host, a port included where the build
    /// names one), the verify path exactly, never the app's own scheme.
    nonisolated static func signInToken(_ url: URL, host: String = Config.host) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == "https", let linkHost = parts.host?.lowercased(),
              parts.user == nil, parts.password == nil,
              linkHost + (parts.port.map { ":\($0)" } ?? "") == host.lowercased(),
              parts.path == "/api/auth/magic-link/verify",
              let token = parts.queryItems?.first(where: { $0.name == "token" })?.value, !token.isEmpty
        else { return nil }
        return token
    }

    /// The pilot said yes: the token spent, and who it signed in as said.
    func confirmLink(_ link: PendingLink) async {
        pendingLink = nil
        do {
            try await Gateway.verifyMagicLink(token: link.token)
            await refresh()
            // Said only where who is signed in could be asked again.
            signedInByLink = problem == nil ? pilot?.email : nil
        } catch {
            problem = "The sign-in link did not work: \(error.localizedDescription)"
            Log.app.error("the sign-in link was refused: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The pilot said no: the link forgotten, the session as it was.
    func cancelLink() { pendingLink = nil }

    /// Signing out ends the session on the gateway and forgets what this
    /// device kept of the pilot's (the owner's pick: sign-out clears,
    /// as the web app's useLogout and forgetPilot do).
    func signOut() async {
        try? await Gateway.signOut()
        pilot = nil
        Session.forgetPilot()
        (flight?.tracking ?? Tracking()).forgetFavorites()
        WidgetFeed.shared.forgetPilot()
        // The session's cookies too: with no signal the gateway's logout
        // never ran, and the next person would still be signed in.
        Session.forgetCookies()
        Session.forgetDevice(trail: flight?.ownShip.trail, recorder: flight?.ownShip.recorder)
    }

    /// What this iPhone recorded or kept of the pilot outside the settings:
    /// the path flown (OwnTrail) and the flight recorder's track, their
    /// files deleted, and the gateway's and planner's answers kept in the
    /// session's cache (the account, the logbook, saved flights). Signing
    /// out and deleting the account both (the store audit's P7). The trail
    /// and the recorder are the flight's (OwnShip); with none in hand their
    /// files are deleted all the same.
    static func forgetDevice(trail: OwnTrail?, recorder: FlightRecorder?,
                             cache: URLCache? = Gateway.session.configuration.urlCache) {
        (trail ?? OwnTrail()).erase()
        (recorder ?? FlightRecorder()).erase()
        cache?.removeAllCachedResponses()
    }

    /// The gateway's cookies gone from the jar the app and the widgets share.
    static func forgetCookies(_ jar: HTTPCookieStorage = SessionCookies.jar) {
        for cookie in jar.cookies ?? [] { jar.deleteCookie(cookie) }
        SessionCookies.keep()
    }

    /// The figures kept per N-number on this device, the pilot's own, and
    /// their airplanes' checklists (LocalChecklists); the Favorites are
    /// the store's (Tracking.forgetFavorites), and the old key of theirs
    /// is gone with the first launch's migration. Of what Keep for the Air
    /// kept, the Go / No-Go (their minimums, loading and currency) and the
    /// routes; the FAA's and the weather's public data stay (KeptForAir).
    static func forgetPilot(_ defaults: UserDefaults = .standard, kept: URL = KeptForAir.folder) {
        for key in defaults.dictionaryRepresentation().keys
            where key.hasPrefix(OwnFigureStore.prefix) || key.hasPrefix(LocalChecklists.prefix) || key == KeptAirplane.key {
            defaults.removeObject(forKey: key)
        }
        KeptForAir.forgetPilotOwn(in: kept)
    }

    /// The account deleted on the gateway (App Review 5.1.1(v)): it takes
    /// everything that was the pilot's and every session; this device its
    /// own copies -- its settings, drills, the last plan, the path flown
    /// and the recorder's track, the cached answers -- and the cookies, as
    /// the web app's useDeleteAccount does. A failure deleted
    /// nothing, and is thrown for the page to say so.
    func deleteAccount() async throws {
        try await Gateway.deleteAccount()
        if let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
        Kept.forget()
        KeptForAir.forgetPilotOwn()
        (flight?.tracking ?? Tracking()).erase()
        Session.forgetCookies()
        Session.forgetDevice(trail: flight?.ownShip.trail, recorder: flight?.ownShip.recorder)
        WidgetFeed.shared.forgetPilot()
        pilot = nil
    }

    /// The contact the gateway keeps (PUT /api/me/contact), its answer the pilot.
    func setContact(phone: String?, homeBase: String?) async throws {
        pilot = try await Gateway.setContact(phone: phone, homeBase: homeBase)
    }
}
