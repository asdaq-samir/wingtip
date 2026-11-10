import SwiftUI

/// Settings' parts laid out as iOS's own Settings app (docs/design/ios.md
/// §13): the pilot first, a row with their initials and name over
/// "Account, Records, Sync" that opens the account's page ("Sign In"
/// before, with what signing in adds), and each row led by a small
/// coloured square from the badge tokens (color.badge.*, radius.badge).

/// The row's leading square, a white glyph on a badge colour, sized with
/// the text.
struct SettingsIcon: View {
    let systemImage: String
    let colour: UIColor
    @ScaledMetric(relativeTo: .body) private var side = 29.0

    var body: some View {
        Image(systemName: systemImage)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: side, height: side)
            .background(Color(uiColor: colour), in: RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// A Settings row: its square and its title.
struct SettingsLabel: View {
    let title: String
    let systemImage: String
    let colour: UIColor

    init(_ title: String, systemImage: String, colour: UIColor) {
        self.title = title
        self.systemImage = systemImage
        self.colour = colour
    }

    var body: some View {
        Label { Text(title) } icon: { SettingsIcon(systemImage: systemImage, colour: colour) }
    }
}

/// The account at the top of Settings, as Settings puts the pilot's name
/// first: signed in, their initials, name and "Account, Records, Sync",
/// opening the account's page; signed out, Sign In and what it keeps.
struct AccountHeadRow: View {
    @Environment(Session.self) private var session
    let signIn: () -> Void
    @ScaledMetric(relativeTo: .title2) private var side = 60.0

    var body: some View {
        if let pilot = session.pilot {
            NavigationLink { AccountPage().navigationBarTitleDisplayMode(.inline) } label: {
                HStack(spacing: WingtipSpace.md) {
                    avatar(StripData.initials(name: pilot.displayName, email: pilot.email))
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text(pilot.displayName).font(WingtipType.heading)
                        Text("Account, Records, Sync").font(WingtipType.detail).foregroundStyle(.secondary)
                    }
                }
            }
            .accessibilityHint("Opens your account")
        } else {
            Button(action: signIn) {
                HStack(spacing: WingtipSpace.md) {
                    avatar("")
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text("Sign In").font(WingtipType.heading)
                        // The system's secondary label, not the button's tinted
                        // secondary, which read too faint (the audit, 2026-11-09).
                        Text("Keep your airplanes, flights and logbook on every device.").font(WingtipType.detail)
                            .foregroundStyle(Color(.secondaryLabel))
                    }
                }
            }
            .disabled(!session.loaded)
        }
    }

    private func avatar(_ initials: String) -> some View {
        ZStack {
            Circle().fill(Color.accentColor)
            if initials.isEmpty {
                Image(systemName: "person.fill").font(.title2).foregroundStyle(.white)
            } else {
                Text(initials).font(.title2.weight(.semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: side, height: side)
        .accessibilityHidden(true)
    }
}

/// The account's page: who is signed in, the contact, the data to take
/// away, Sign Out, and Delete Account last, destructive and asked first
/// (HIG Managing accounts: "help them delete it").
struct AccountPage: View {
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if let pilot = session.pilot {
                Section {
                    LabeledContent("Name", value: pilot.displayName)
                    LabeledContent("Email", value: pilot.email)
                    NavigationLink("Contact") { ContactView().navigationBarTitleDisplayMode(.inline) }
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
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
    }
}
