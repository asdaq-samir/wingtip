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
    /// A page the account menu opens.
    let open: (SheetPage) -> Void

    var body: some ToolbarContent {
        UndoToolbarItem()
        ToolbarItemGroup(placement: .topBarTrailing) {
            if let hear {
                MicButton(listening: VoiceInput.shared.listening, busy: model.busy, action: hear)
            }
            AccountMenu(open: open)
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
/// design, 2026-11-09): a stock menu of Setup's rows -- the account, the
/// flying screens, the pilot's records, the minimums and the rest -- each
/// opening its page on the sheet's stack, and Settings, the page with the
/// map's switches, the alerts, the look and the chart.
struct AccountMenu: View {
    let open: (SheetPage) -> Void
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan
    @State private var signingIn = false

    private var initials: String {
        StripData.initials(name: session.pilot?.displayName ?? session.pilot?.fullName, email: session.pilot?.email)
    }

    var body: some View {
        Menu {
            Section {
                if let pilot = session.pilot {
                    Text(pilot.displayName)
                    Button(role: .destructive) { Task { await session.signOut(); plan.forgetPilot() } } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } else {
                    Button { signingIn = true } label: { Label("Sign In", systemImage: "person.crop.circle.badge.plus") }
                        .disabled(!session.loaded)
                }
            }
            Section("Flying") {
                Button { PendingCommand.shared.command = .open(.emergency) } label: {
                    Label(Screen.emergency.title, systemImage: "exclamationmark.triangle.fill")
                }
                item(.screen(.checklists), Screen.checklists.title, "checklist")
                item(.screen(.flights), Screen.flights.title, "tray.full")
                item(.screen(.airplanes), Screen.airplanes.title, WingtipIcon.airplane)
                item(.practice, "Practice", "figure.walk.motion")
            }
            if session.signedIn {
                Section("Pilot") {
                    item(.screen(.logbook), "Logbook and Currency", "book")
                    item(.training, "Training", "graduationcap")
                    item(.instructing, "Instructing", "person.2")
                    item(.screen(.coach), Screen.coach.title, "brain.head.profile")
                }
            }
            Section {
                item(.screen(.minimums), Screen.minimums.title, "cloud.sun")
                item(.screen(.guide), Screen.guide.title, "questionmark.circle")
                item(.screen(.downloads), Screen.downloads.title, "arrow.down.circle")
                item(.screen(.about), Screen.about.title, "info.circle")
            }
            Section {
                item(.screen(.setup), "Settings", WingtipIcon.settings)
            }
        } label: {
            if initials.isEmpty {
                Image(systemName: WingtipIcon.account)
            } else {
                Text(initials).font(WingtipType.detail.weight(.semibold))
            }
        }
        .menuOrder(.fixed)
        .accessibilityLabel(session.pilot.map { "\($0.displayName), account and settings" } ?? "Account and Settings")
        .accessibilityIdentifier("account-menu")
        .sheet(isPresented: $signingIn) { SignInView() }
    }

    private func item(_ page: SheetPage, _ title: String, _ systemImage: String) -> some View {
        Button { open(page) } label: { Label(title, systemImage: systemImage) }
    }
}
