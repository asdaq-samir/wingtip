import SwiftUI

/// The bar beside the one search: the microphone, then the account button
/// (the Main artboard), and the system's Undo at the left while an edit
/// can be taken back (UndoToolbarItem). Stock toolbar items, glass on
/// iOS 26 and later as the system draws its bar's buttons.
struct SearchBarItems: ToolbarContent {
    let model: OneSearchModel
    /// One line heard and done (the sheet's FieldRunner); nil where speech
    /// cannot be recognised on this iPhone, which then has no microphone.
    let hear: (() -> Void)?
    /// A page of the sheet's stack: Settings, the account button's.
    let open: (SheetPage) -> Void

    var body: some ToolbarContent {
        UndoToolbarItem()
        ToolbarItemGroup(placement: .topBarTrailing) {
            if let hear {
                MicButton(listening: VoiceInput.shared.listening, busy: model.busy, action: hear)
            }
            AccountButton(open: open)
        }
    }
}

/// The search's microphone, apart from the field (the owner's design): Ask
/// by voice, one line said -- the words appearing in the search field as
/// they are said, as the keyboard's dictation types them -- and done as if
/// typed and sent, recognised on this iPhone alone (VoiceInput,
/// requiresOnDeviceRecognition). The system's `mic` glyph, filled and
/// breathing while it listens; a second tap ends it. Nothing of the
/// radio's: its waves and words are the radio's own (the owner,
/// 2026-11-10).
struct MicButton: View {
    let listening: Bool
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button {
            if listening { VoiceInput.shared.finish() } else { action() }
        } label: {
            Image(systemName: listening ? "mic.fill" : WingtipIcon.microphone)
                .symbolDictating(listening)
                .symbolSwap()
        }
        .disabled(busy)
        .accessibilityLabel(listening ? "Listening…" : "Say It")
        .accessibilityHint("Say a field, a route, a screen or a question")
        .accessibilityIdentifier("search-mic")
    }
}

/// The account button, Setup's home now the tabs are gone (the owner's
/// design, 2026-11-09): a tap opens Settings on the sheet's stack, with
/// nothing in between (the owner, 2026-11-10: "When tapping the avatar
/// just open the settings"). Settings holds what the menu did: the
/// account and signing in or out, the flying screens, the pilot's
/// records, the minimums, the look and the rest (SetupView).
struct AccountButton: View {
    let open: (SheetPage) -> Void
    @Environment(Session.self) private var session

    private var initials: String {
        StripData.initials(name: session.pilot?.displayName ?? session.pilot?.fullName, email: session.pilot?.email)
    }

    var body: some View {
        Button { open(.screen(.setup)) } label: {
            if initials.isEmpty {
                Image(systemName: WingtipIcon.account)
            } else {
                Text(initials).font(WingtipType.detail.weight(.semibold))
            }
        }
        .accessibilityLabel(session.pilot.map { "\($0.displayName), account and settings" } ?? "Account and Settings")
        .accessibilityIdentifier("account-button")
    }
}
