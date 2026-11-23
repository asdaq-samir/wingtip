import AuthenticationServices
import SwiftUI

/// The two ways in the app offers, as docs/NATIVE.md has them: Sign in with
/// Apple through iOS's own sheet, or a link emailed to the pilot that
/// opens the app. Google refuses to sign in inside an app, so it stays
/// the website's.
struct SignInView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    /// The address is not one: said under the field (owner rec 3).
    @State private var addressWrong = false
    @State private var sent = false
    /// The nonce sent with the attempt in progress, the one hashed into it.
    @State private var nonce: String?

    /// The web's words for an address that is not one.
    static let badAddress = String(localized: "Enter an email address like you@example.com")

    /// An email address by the grammar a browser's email field checks
    /// (the HTML standard's "valid email address"), as the web's sign-in
    /// checks it: something@host, the host's labels of letters, digits
    /// and hyphens.
    static func isAddress(_ text: String) -> Bool {
        text.wholeMatch(of: /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*/) != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.email, .fullName]
                        // The gateway's nonce for this attempt, hashed as
                        // Apple asks (the security audit's L5).
                        nonce = session.appleNonce
                        request.nonce = nonce.map(Session.hashedNonce)
                    } onCompletion: { result in
                        guard case .success(let auth) = result,
                              let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                              let token = credential.identityToken, let identity = String(data: token, encoding: .utf8)
                        else { return }
                        // The code the gateway trades for the token it
                        // revokes when the account is deleted (5.1.1(v)).
                        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
                        Task {
                            await session.signInWithApple(identityToken: identity, authorizationCode: code, nonce: nonce)
                            if session.signedIn { dismiss() }
                        }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .listRowInsets(EdgeInsets())
                }
                Section("Or by Email") {
                    TextField("Email Address", text: $email, prompt: Text(verbatim: "you@example.com"))
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: email) { _, _ in addressWrong = false }
                    if addressWrong { ProblemLine(Self.badAddress) }
                    if sent {
                        Text("Check your mail: the link opens Wingtip Maps and signs you in.")
                            .font(.footnote)
                    } else {
                        Button("Send Me a Link") {
                            let address = email.trimmingCharacters(in: .whitespaces)
                            // Checked here and said under the field, as the
                            // web's sign-in does, before the server is asked.
                            guard Self.isAddress(address) else { addressWrong = true; return }
                            Task { sent = await session.requestMagicLink(email: address) }
                        }
                        .disabled(!email.contains("@"))
                    }
                }
                if let problem = session.problem {
                    Section { ProblemLine(problem) }
                }
            }
            .task { await session.prepareAppleNonce() }
            .navigationTitle(Wording.signIn)
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { dismiss() }
        }
    }
}

#Preview("SignInView") {
    SignInView()
        .environment(Session())
}
