import SwiftUI

/// You, the avatar's card, as Apple Maps' account card (the owner's pick
/// of option A of the account canvas and his iOS 27 screenshot,
/// 2026-11-13; docs/design/rules.md §8): who the pilot is and what is
/// theirs. The head is the large avatar with the initials, the name large
/// and bold and the email small and grey under it -- with no name, Add
/// Your Name in the tint, opening Pilot Details where the Name field is.
/// Signed out it says so once (the owner, 2026-11-13): the head's large
/// line is Sign In, the stock button in the tint, with no "You" in the bar
/// and nothing more under it, and the rows that need an account are there
/// but disabled. Then one inset list of round-badged rows with
/// their values: Pilot Details, Airplanes (the checklists inside), Flights,
/// Logbook, Minimums, Training (the coach and the drills) and Emergency.
/// Settings is the gear at the card's top left, the close at its right
/// (CardStack). No Subscription row: nothing is sold yet (the free app,
/// the owner's word).
struct YouView: View {
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan
    @Environment(Navigator.self) private var nav
    @State private var signingIn = false
    @State private var naming = false

    var body: some View {
        List {
            Section {
                YouHead(signIn: { signingIn = true }, addName: { naming = true })
                    .listRowBackground(Color.clear)
                ProblemLine(session.problem)
            }
            Section {
                NavigationLink { PilotDetailsView() } label: {
                    YouRowLabel(title: "Pilot Details", systemImage: "person.text.rectangle", colour: WingtipColor.Badge.tower,
                                value: session.pilot?.homeBase)
                }
                .disabled(!session.signedIn)
                .accessibilityIdentifier("pilot-details-row")
                NavigationLink { OwnAircraftListView() } label: {
                    YouRowLabel(title: "Airplanes", systemImage: WingtipIcon.airplane, colour: WingtipColor.Badge.approach,
                                value: plan.airplaneName)
                }
                .accessibilityIdentifier("airplanes-row")
                NavigationLink { FlightsView() } label: {
                    YouRowLabel(title: "Flights", systemImage: "tray.full", colour: WingtipColor.Badge.weather)
                }
                NavigationLink { LogbookView() } label: {
                    YouRowLabel(title: Screen.logbook.title, systemImage: "book", colour: WingtipColor.Badge.fuel)
                }
                .disabled(!session.signedIn)
                .accessibilityIdentifier("logbook-row")
                // The weather the pilot will not take off or land in, kept
                // on this phone: the Brief's Go / No-Go holds it to them.
                NavigationLink { MinimumsView() } label: {
                    YouRowLabel(title: "Minimums", systemImage: "cloud.sun", colour: WingtipColor.Badge.ground)
                }
                NavigationLink { TrainingPage() } label: {
                    YouRowLabel(title: "Training", systemImage: "graduationcap", colour: WingtipColor.Badge.lodging)
                }
                .accessibilityIdentifier("training-row")
                EmergencyRow()
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("You")
        // The head says who it is; the bar keeps only the gear and the close.
        // Signed out the title goes too, so the card says Sign In alone;
        // kept as the title, it still names the pages' way back.
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: session.signedIn ? nil : .title)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SettingsGear { nav.push(.settings(atMap: false)) }
            }
        }
        // Add Your Name pushes Pilot Details as its row does, so its Back
        // comes back to You.
        .navigationDestination(isPresented: $naming) { PilotDetailsView() }
        .sheet(isPresented: $signingIn) { SignInView().presentationDetents([.medium, .large]) }
        .refreshable { await session.refresh() }
    }
}

/// You's head: the avatar, then the name and the email, centred.
private struct YouHead: View {
    @Environment(Session.self) private var session
    @Environment(\.lookAccent) private var accent
    let signIn: () -> Void
    let addName: () -> Void
    @ScaledMetric(relativeTo: .largeTitle) private var side = 72.0

    /// The name as given, never the address an email sign-in names the
    /// pilot by.
    private var name: String? {
        guard let pilot = session.pilot else { return nil }
        for candidate in [pilot.fullName, pilot.displayName] {
            if let text = candidate?.trimmingCharacters(in: .whitespaces), !text.isEmpty, !text.contains("@") { return text }
        }
        return nil
    }

    var body: some View {
        VStack(spacing: WingtipSpace.sm) {
            avatar
            if let pilot = session.pilot {
                if let name {
                    Text(name).font(.title.bold()).multilineTextAlignment(.center)
                } else {
                    Button("Add Your Name", action: addName)
                        .font(.title.bold())
                        .buttonStyle(.borderless)
                        .accessibilityIdentifier("add-your-name")
                }
                Text(pilot.email).font(WingtipType.detail).foregroundStyle(.secondary)
            } else {
                Button("Sign In", action: signIn)
                    .font(.title.bold())
                    .buttonStyle(.borderless)
                    .disabled(!session.loaded)
                    .accessibilityIdentifier("you-sign-in")
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var avatar: some View {
        let initials = StripData.initials(name: name, email: session.pilot?.email)
        return ZStack {
            Circle().fill(accent)
            if initials.isEmpty {
                Image(systemName: "person.fill").font(.largeTitle).foregroundStyle(.white)
            } else {
                Text(initials).font(.largeTitle.weight(.semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: side, height: side)
        .accessibilityHidden(true)
    }
}

/// Training, one row of You opening the coach and the drills (the owner,
/// 2026-11-13), and, signed in, the pilot's training record and the
/// students they teach.
struct TrainingPage: View {
    @Environment(Session.self) private var session

    var body: some View {
        List {
            // What needs an account is there but disabled signed out, with
            // no words of its own: You's head is the one Sign In.
            NavigationLink { CoachView() } label: {
                SettingsLabel(Screen.coach.title, systemImage: "target", colour: WingtipColor.Badge.food)
            }
            .disabled(!session.signedIn)
            NavigationLink { PracticeView() } label: {
                SettingsLabel("Practice", systemImage: "figure.walk.motion", colour: WingtipColor.Badge.traffic)
            }
            .accessibilityIdentifier("practice-row")
            Group {
                NavigationLink { TrainingView() } label: {
                    SettingsLabel("Lessons and Endorsements", systemImage: "graduationcap", colour: WingtipColor.Badge.lodging)
                }
                NavigationLink { InstructorView() } label: {
                    SettingsLabel("Instructing", systemImage: "person.2", colour: WingtipColor.Badge.ground)
                }
            }
            .disabled(!session.signedIn)
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Training")
    }
}

/// The emergency assistant, a row of You's one list as Apple's account
/// card has every row (the owner's screenshot, 2026-11-13): opened by its
/// name, the card that opens at full height.
struct EmergencyRow: View {
    @Environment(\.appCommand) private var appCommand

    var body: some View {
        Button { appCommand(.open(.emergency)) } label: {
            YouRowLabel(title: "Emergency", systemImage: "light.beacon.max", colour: WingtipColor.Badge.hazard)
        }
        .foregroundStyle(.primary)
        .accessibilityIdentifier("setup-emergency")
    }
}

#Preview("YouView") {
    NavigationStack { YouView() }
        .environment(Session())
        .environment(Plan())
        .environment(Navigator())
}
