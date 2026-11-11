import SwiftUI

/// The emailed sign-in link's question, over whatever is on the screen:
/// opening the link signs nobody in until the pilot says so, and a pilot
/// already signed in is told whose session the link would replace (the
/// security audit of 2026-11-10, M1; the web's LinkSignIn asks the same).
/// The link's account is named in the question, masked as the gateway
/// gives it (POST /api/auth/magic-link/account, before the token is
/// spent); a used or expired link offers no Sign In. Once in, who the link
/// signed in as is named again, with "That's Not Me" to sign out at once.
struct LinkSignInPrompt: ViewModifier {
    @Bindable var session: Session

    func body(content: Content) -> some View {
        content
            .alert(
                Self.title(session.pendingLink),
                isPresented: Binding(get: { session.pendingLink != nil }, set: { if !$0 { session.cancelLink() } }),
                presenting: session.pendingLink) { link in
                    // The link the alert was put up for, held here: the
                    // alert's dismissal clears the pending one first.
                    if link.usable {
                        Button(link.replacing == nil ? "Sign In" : "Switch") { Task { await session.confirmLink(link) } }
                        Button("Cancel", role: .cancel) { session.cancelLink() }
                    } else {
                        Button("OK", role: .cancel) { session.cancelLink() }
                    }
            } message: { link in
                Text(Self.message(link))
            }
            .alert(
                "Signed In",
                isPresented: Binding(get: { session.signedInByLink != nil }, set: { if !$0 { session.signedInByLink = nil } }),
                presenting: session.signedInByLink) { _ in
                    Button("OK", role: .cancel) { session.signedInByLink = nil }
                    Button("That's Not Me", role: .destructive) {
                        session.signedInByLink = nil
                        Task { await session.signOut() }
                    }
            } message: { email in
                Text("You're signed in as \(email). Your airplanes, flights and logbook are saved to this account.")
            }
    }

    /// The question's title: a link that cannot sign in says so.
    static func title(_ link: Session.PendingLink?) -> String {
        switch link?.account {
        case .expired: "Link Expired"
        case .tooMany: "Try Again Later"
        case .email(let email): link?.replacing == nil ? "Sign In as \(email)?" : "Switch to \(email)?"
        case nil: link?.replacing == nil ? "Sign In from This Link?" : "Switch Accounts?"
        }
    }

    /// What the question says: whose account the link is for where the
    /// gateway said, only a link you asked for yourself, and, where someone
    /// is signed in, whose session it would replace.
    static func message(_ link: Session.PendingLink) -> String {
        switch link.account {
        case .expired: return "This sign-in link has been used or has expired. Ask for a new one from Sign In."
        case .tooMany: return "Too many sign-in links were checked from this network in the last hour. Try the link again later."
        default: break
        }
        let own = "Only open a sign-in link you asked for yourself, from your own email."
        let whose = if case .email(let email) = link.account { "This link signs in to \(email). " } else { "" }
        guard let replacing = link.replacing else { return whose + own }
        let instead = if case .email(let email) = link.account { "This link signs in to \(email) instead." } else { "This link signs in to the account it was sent to instead." }
        return "You're signed in as \(replacing). \(instead) \(own)"
    }
}
