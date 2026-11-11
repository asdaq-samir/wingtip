import Foundation
import Testing
@testable import Wingtip

/// The emailed sign-in link taken only from this build's own gateway and
/// only on the pilot's yes (security audit 2026-11-10, M1), and the
/// session's cookies kept in the Keychain (L9).
@MainActor
struct SignInSecurityTests {
    private let host = "wingtipmaps.app"

    @Test func onlyTheGatewaysOwnHttpsLinkIsASignIn() {
        func token(_ text: String) -> String? { Session.signInToken(URL(string: text)!, host: host) }
        #expect(token("https://wingtipmaps.app/api/auth/magic-link/verify?token=abc") == "abc")
        #expect(token("https://WINGTIPMAPS.app/api/auth/magic-link/verify?token=abc") == "abc")
        // The app's own scheme, the attack the audit found.
        #expect(token("wingtipmaps://x/api/auth/magic-link/verify?token=abc") == nil)
        // Plain http, another host, a look-alike host, a port not the build's.
        #expect(token("http://wingtipmaps.app/api/auth/magic-link/verify?token=abc") == nil)
        #expect(token("https://evil.example/api/auth/magic-link/verify?token=abc") == nil)
        #expect(token("https://wingtipmaps.app.evil.example/api/auth/magic-link/verify?token=abc") == nil)
        #expect(token("https://wingtipmaps.app:8443/api/auth/magic-link/verify?token=abc") == nil)
        #expect(token("https://user@wingtipmaps.app/api/auth/magic-link/verify?token=abc") == nil)
        // A path that only ends the same, and no token.
        #expect(token("https://wingtipmaps.app/x/api/auth/magic-link/verify?token=abc") == nil)
        #expect(token("https://wingtipmaps.app/api/auth/magic-link/verify") == nil)
        #expect(token("https://wingtipmaps.app/api/auth/magic-link/verify?token=") == nil)
    }

    @Test func aBuildOnAPortTakesItsOwnPort() {
        #expect(Session.signInToken(URL(string: "https://10.0.0.193:8443/api/auth/magic-link/verify?token=t")!, host: "10.0.0.193:8443") == "t")
        #expect(Session.signInToken(URL(string: "https://10.0.0.193/api/auth/magic-link/verify?token=t")!, host: "10.0.0.193:8443") == nil)
    }

    @Test func openingALinkOnlyAsksAndCancelForgetsIt() async {
        let session = Session()
        session.askLinkAccount = { _ in .email("a•••@icloud.com") }
        await session.open(URL(string: "https://\(Config.host)/api/auth/magic-link/verify?token=abc")!)
        #expect(session.pendingLink?.token == "abc")
        #expect(session.pendingLink?.replacing == nil)
        session.cancelLink()
        #expect(session.pendingLink == nil)
        await session.open(URL(string: "wingtipmaps://x/api/auth/magic-link/verify?token=abc")!)
        #expect(session.pendingLink == nil)
    }

    @Test func theQuestionNamesTheSessionItWouldReplace() {
        let fresh = Session.PendingLink(token: "t", replacing: nil)
        #expect(!LinkSignInPrompt.message(fresh).contains("signed in as"))
        let switching = Session.PendingLink(token: "t", replacing: "pilot@example.com")
        #expect(LinkSignInPrompt.message(switching).contains("You're signed in as pilot@example.com"))
    }

    @Test func theQuestionNamesTheLinksAccountBeforeItIsSpent() async {
        let named = Session.PendingLink(token: "t", replacing: nil, account: .email("a•••@icloud.com"))
        #expect(LinkSignInPrompt.title(named) == "Sign In as a•••@icloud.com?")
        #expect(LinkSignInPrompt.message(named).contains("signs in to a•••@icloud.com"))
        #expect(named.usable)
        let switching = Session.PendingLink(token: "t", replacing: "me@example.com", account: .email("b•••@gmail.com"))
        #expect(LinkSignInPrompt.message(switching).contains("You're signed in as me@example.com. This link signs in to b•••@gmail.com instead."))
        // A used or expired link offers no Sign In.
        let used = Session.PendingLink(token: "t", replacing: nil, account: .expired)
        #expect(!used.usable && LinkSignInPrompt.title(used) == "Link Expired")
        #expect(!Session.PendingLink(token: "t", replacing: nil, account: .tooMany).usable)
        // Asked when the link opens: the masked address is on the question.
        let session = Session()
        session.askLinkAccount = { _ in .expired }
        await session.open(URL(string: "https://\(Config.host)/api/auth/magic-link/verify?token=abc")!)
        #expect(session.pendingLink?.account == .expired)
    }

    @Test func theAppleNonceIsHashedAsAppleAsks() {
        // FIPS 180-2's own example: SHA-256("abc"), as lowercase hex.
        #expect(Session.hashedNonce("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    // MARK: The session's cookies

    private func cookie(_ name: String, expires: Date?) -> HTTPCookie {
        var properties: [HTTPCookiePropertyKey: Any] = [.name: name, .value: "v-\(name)", .domain: host, .path: "/", .secure: "TRUE"]
        if let expires { properties[.expires] = expires }
        return HTTPCookie(properties: properties)!
    }

    private func vault() -> SessionCookies.Vault {
        SessionCookies.Vault(service: "app.wingtipmaps.session.test", account: UUID().uuidString, group: nil)
    }

    @Test func cookiesComeBackFromTheirBytes() throws {
        let month = Date().addingTimeInterval(30 * 86400)
        let back = SessionCookies.decode(try #require(SessionCookies.encode([cookie("SESSION", expires: month), cookie("XSRF-TOKEN", expires: nil)])))
        #expect(back.map(\.name).sorted() == ["SESSION", "XSRF-TOKEN"])
        #expect(back.first { $0.name == "SESSION" }?.value == "v-SESSION")
        #expect(SessionCookies.decode(Data("not a plist".utf8)).isEmpty)
    }

    @Test func theOldJarIsMovedIntoTheKeychainOnceAndEmptied() throws {
        let old = try #require(URLSessionConfiguration.ephemeral.httpCookieStorage)
        old.setCookie(cookie("SESSION", expires: Date().addingTimeInterval(86400)))
        old.setCookie(cookie("STALE", expires: Date().addingTimeInterval(-60)))
        let vault = vault()
        defer { vault.write(nil) }
        let moved = SessionCookies.migrate(from: old, vault: vault)
        #expect(moved.map(\.name) == ["SESSION"])
        #expect((old.cookies ?? []).isEmpty)
        let kept = SessionCookies.decode(try #require(vault.read()))
        #expect(kept.map(\.name) == ["SESSION"])
    }

    @Test func aSignOutDeletesTheKeychainItem() throws {
        let jar = try #require(URLSessionConfiguration.ephemeral.httpCookieStorage)
        let vault = vault()
        jar.setCookie(cookie("SESSION", expires: Date().addingTimeInterval(86400)))
        SessionCookies.keep(jar, vault: vault)
        #expect(vault.read() != nil)
        for c in jar.cookies ?? [] { jar.deleteCookie(c) }
        SessionCookies.keep(jar, vault: vault)
        #expect(vault.read() == nil)
    }
}
