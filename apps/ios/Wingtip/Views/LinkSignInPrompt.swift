import SwiftUI

/// The emailed sign-in link's question, over whatever is on the screen:
/// opening the link signs nobody in until the pilot says so, and a pilot
/// already signed in is told whose session the link would replace (the
/// security audit of 2026-11-10, M1; the web's LinkSignIn asks the same).
/// Once in, who the link signed in as is named, with "That's Not Me" to
/// sign out at once, since the gateway names the account only after the
/// token is spent.
struct LinkSignInPrompt: ViewModifier {
    @Bindable var session: Session

    func body(content: Content) -> some View {
        content
            .alert(
                session.pendingLink?.replacing == nil ? "Sign In from This Link?" : "Switch Accounts?",
                isPresented: Binding(get: { session.pendingLink != nil }, set: { if !$0 { session.cancelLink() } }),
                presenting: session.pendingLink
            ) { _ in
                Button(session.pendingLink?.replacing == nil ? "Sign In" : "Switch") { Task { await session.confirmLink() } }
                Button("Cancel", role: .cancel) { session.cancelLink() }
            } message: { link in
                Text(Self.message(replacing: link.replacing))
            }
            .alert(
                "Signed In",
                isPresented: Binding(get: { session.signedInByLink != nil }, set: { if !$0 { session.signedInByLink = nil } }),
                presenting: session.signedInByLink
            ) { _ in
                Button("OK", role: .cancel) { session.signedInByLink = nil }
                Button("That's Not Me", role: .destructive) {
                    session.signedInByLink = nil
                    Task { await session.signOut() }
                }
            } message: { email in
                Text("You're signed in as \(email). Your airplanes, flights and logbook are saved to this account.")
            }
    }

    /// What the question says: only a link you asked for yourself, and,
    /// where someone is signed in, whose session it would replace.
    static func message(replacing: String?) -> String {
        let own = "Only open a sign-in link you asked for yourself, from your own email."
        guard let replacing else { return own }
        return "You're signed in as \(replacing). This link signs in to the account it was sent to instead. \(own)"
    }
}
