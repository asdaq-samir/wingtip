import SwiftUI

/// You's and Settings' row parts, laid out as iOS's own Settings app and
/// Apple Maps' account card (docs/design/ios.md §13): each row led by a
/// small coloured badge from the badge tokens (color.badge.*, radius.badge),
/// round on You as Maps' account card draws them.

/// The row's leading badge, a white glyph on a badge colour, sized with
/// the text: a rounded square, or round.
struct SettingsIcon: View {
    let systemImage: String
    let colour: UIColor
    var round = false
    @ScaledMetric(relativeTo: .body) private var side = 29.0

    var body: some View {
        Image(systemName: systemImage)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: side, height: side)
            .background(Color(uiColor: colour), in: round
                ? AnyShape(Circle())
                : AnyShape(RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous)))
            .accessibilityHidden(true)
    }
}

/// A Settings row: its badge and its title.
struct SettingsLabel: View {
    let title: String
    let systemImage: String
    let colour: UIColor
    var round = false

    init(_ title: String, systemImage: String, colour: UIColor, round: Bool = false) {
        self.title = title
        self.systemImage = systemImage
        self.colour = colour
        self.round = round
    }

    var body: some View {
        Label { Text(title) } icon: { SettingsIcon(systemImage: systemImage, colour: colour, round: round) }
    }
}

/// A row of You: its round badge, its title and its value at the end, as
/// Apple Maps' account card lists its rows (the owner's iOS 27 screenshot,
/// 2026-11-13); the chevron is the NavigationLink's own.
struct YouRowLabel: View {
    let title: String
    let systemImage: String
    let colour: UIColor
    var value: String?

    var body: some View {
        LabeledContent {
            if let value { Text(value) }
        } label: {
            SettingsLabel(title, systemImage: systemImage, colour: colour, round: true)
        }
    }
}

/// Pilot Details, You's first row: the name as on the pilot certificate,
/// the email signed in with, the contact (a phone and the home base), then
/// the account's menu -- Export My Data, Sign Out, and Delete Account last,
/// destructive and asked first (HIG Managing accounts: "help them delete
/// it").
struct PilotDetailsView: View {
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var problem: String?
    @FocusState private var naming: Bool

    var body: some View {
        List {
            if let pilot = session.pilot {
                Section {
                    LabeledContent("Name") {
                        TextField("Name", text: $name, prompt: Text("As on your certificate"))
                            .multilineTextAlignment(.trailing)
                            .textContentType(.name)
                            .focused($naming)
                            .submitLabel(.done)
                            .onSubmit { save() }
                            .accessibilityIdentifier("pilot-name")
                    }
                    LabeledContent("Email", value: pilot.email)
                    NavigationLink { ContactView() } label: {
                        LabeledContent("Contact") { if let home = pilot.homeBase { Text(home) } }
                    }
                } footer: {
                    if let problem { ProblemLine(problem) }
                }
                Section {
                    ExportDataButton()
                }
                Section {
                    Button("Sign Out", role: .destructive) {
                        Task { await session.signOut(); plan.forgetPilot(); dismiss() }
                    }
                }
                Section {
                    DeleteAccountButton()
                }
            }
            ProblemLine(session.problem)
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Pilot Details")
        .onAppear { name = session.pilot?.fullName ?? "" }
        // A name typed and left is kept, as Settings' fields keep themselves.
        .onChange(of: naming) { _, now in if !now { save() } }
    }

    /// The name as the gateway keeps it (the training record's, as the web's
    /// Pilot Details saves it), then the pilot read again.
    private func save() {
        let typed = name.trimmingCharacters(in: .whitespaces)
        guard !typed.isEmpty, typed != session.pilot?.fullName else { return }
        Task {
            do {
                _ = try await Gateway.setTrainingName(typed)
                await session.refresh()
                problem = nil
            } catch {
                problem = "Your name was not saved: \(error.localizedDescription)"
            }
        }
    }
}
