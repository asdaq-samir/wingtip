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
    /// The bar's Undo; in the one-row header it is the route card's •••'s
    /// (RouteCard), shake and the Edit menu.
    var undo = true

    var body: some ToolbarContent {
        if undo { UndoToolbarItem() }
        if let hear {
            ToolbarItem(placement: .topBarTrailing) {
                MicButton(listening: VoiceInput.shared.listening, busy: model.busy, action: hear)
            }
        }
        // The account its own round glass, apart from the microphone's, as
        // Maps' avatar is (the owner's decision, 2026-11-10;
        // docs/design/ios.md §1): the system's fixed spacer splits the
        // bar's glass between them.
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) { AccountButton(open: open) }
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

/// The account button, the avatar: a tap opens You, the account card
/// (YouView; the owner's option A of the account canvas, 2026-11-13, as
/// Apple Maps' avatar opens its account card), Settings a gear on it.
struct AccountButton: View {
    let open: (SheetPage) -> Void
    @Environment(Session.self) private var session

    private var initials: String {
        StripData.initials(name: session.pilot?.displayName ?? session.pilot?.fullName, email: session.pilot?.email)
    }

    var body: some View {
        Button { open(.screen(.setup)) } label: {
            Group {
                if initials.isEmpty {
                    Image(systemName: WingtipIcon.account)
                } else {
                    Text(initials).font(WingtipType.detail.weight(.semibold))
                }
            }
            // 44 by 44, Maps' avatar's size (the owner, 2026-11-10), where
            // it drew 40 by 36 in the microphone's capsule.
            .frame(width: WingtipSize.tapTarget, height: WingtipSize.tapTarget)
        }
        .accessibilityLabel(session.pilot.map { "\($0.displayName), You" } ?? "You")
        .accessibilityIdentifier("account-button")
    }
}
