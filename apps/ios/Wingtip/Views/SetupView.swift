import SwiftUI

/// Settings, the account button's page (Setup's rows, the owner's
/// one-search design, 2026-11-09): the pilot's account, the flying
/// screens, a row to the Map card, the look, and the chart's
/// edition and what of it is kept for the air. A card over the plan; its
/// rows open their pages in it. Laid out as iOS's Settings
/// (docs/design/ios.md §13): a large title, the pilot first (AccountHeadRow,
/// their account a page of its own with Delete Account last), then the
/// groups as they were, each row led by a badge-coloured square. No Save:
/// every row keeps itself as it changes.
struct SetupView: View {
    @Environment(Session.self) private var session
    @Environment(Charts.self) private var charts
    @Environment(Plan.self) private var plan
    @State private var signingIn = false
    @State private var keptBytes: Int64 = 0
    @AppStorage(ChartNight.key) private var chartNight = ChartNight.dimmed.rawValue
    /// The screen's layout, the plan or the strip (RootView).
    @AppStorage("layout") private var layoutName = "plan"
    /// The app's look, Wingtip's own unless another is picked (Look).
    @AppStorage(Look.key) private var look = Look.standard.rawValue

    var body: some View {
        List {
            Section {
                AccountHeadRow { signingIn = true }
                ProblemLine(session.problem)
            }
            // Every screen of the pilot's own two taps from the map
            // (docs/navigation.md): the emergency assistant on the
            // ground, the checklists, the saved flights, the airplanes
            // and the drills, each a row here as well as in its home.
            Section("Flying") {
                EmergencyAssistantRow()
                NavigationLink { ChecklistsPage() } label: { SettingsLabel(Screen.checklists.title, systemImage: "checklist", colour: WingtipColor.Badge.ground) }
                NavigationLink { FlightsView() } label: { SettingsLabel(Screen.flights.title, systemImage: "tray.full", colour: WingtipColor.Badge.tower) }
                NavigationLink { OwnAircraftListView() } label: { SettingsLabel(Screen.airplanes.title, systemImage: WingtipIcon.airplane, colour: WingtipColor.Badge.approach) }
                NavigationLink { PracticeView() } label: { SettingsLabel("Practice", systemImage: "figure.walk.motion", colour: WingtipColor.Badge.traffic) }
            }
            if session.signedIn {
                Section("Pilot") {
                    NavigationLink { LogbookView() } label: { SettingsLabel("Logbook and Currency", systemImage: "book", colour: WingtipColor.Badge.fuel) }
                    NavigationLink { TrainingView() } label: { SettingsLabel("Training", systemImage: "graduationcap", colour: WingtipColor.Badge.lodging) }
                    NavigationLink { InstructorView() } label: { SettingsLabel("Instructing", systemImage: "person.2", colour: WingtipColor.Badge.ground) }
                    NavigationLink { CoachView() } label: { SettingsLabel("Coach", systemImage: "brain.head.profile", colour: WingtipColor.Badge.food) }
                }
            }
            // The weather the pilot will not take off or land in, kept
            // on this phone: the Brief's Go / No-Go holds it to them.
            // Here alone (docs/decisions/0014, one home per control): the
            // Brief's own link to it is gone (the UI audit, 2026-11-09).
            Section {
                NavigationLink { MinimumsView() } label: { SettingsLabel("Personal Minimums", systemImage: "cloud.sun", colour: WingtipColor.Badge.weather) }
                NavigationLink { PilotGuideView() } label: { SettingsLabel("Guide", systemImage: "questionmark.circle", colour: WingtipColor.Badge.rule) }
            }
            // How the app looks, in one titled group (the iOS sheet audit,
            // 2026-11-10, found a group with no title and a "Look" group of
            // one "Look" row): the map's own settings, its Map card (the
            // Map button's, MapSettingsView), one home for them; the plan
            // under the one search, or the strip (StripSheetView), the
            // owner's pick of 2026-11-04, a segmented control, as a setting
            // of two is; and the look -- the brand's by default, Glass
            // Cockpit and Chart Ink kept to pick (the owner, 2026-11-09),
            // and Native, iOS's own (2026-11-10) -- a menu, as a discrete
            // setting is (docs/decisions/0017).
            Section("Display") {
                NavigationLink(value: SheetPage.mapSettings) { SettingsLabel("Map", systemImage: "map", colour: WingtipColor.Badge.chart) }
                LabeledContent("Screen") {
                    Picker("Screen", selection: $layoutName) {
                        Text("Plan").tag("plan")
                        Text("Strip").tag("strip")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()
                }
                Picker("Look", selection: $look) {
                    ForEach(Look.allCases) { Text($0.label).tag($0.rawValue) }
                }
            }
            Section("Chart") {
                // The white paper chart dimmed in dark appearance, so it
                // does not take the pilot's night vision: a menu of two,
                // as the web app's Settings has it.
                Picker("Chart at Night", selection: $chartNight) {
                    ForEach(ChartNight.allCases) { Text($0.label).tag($0.rawValue) }
                }
                if let info = charts.info {
                    LabeledContent("Edition", value: info.chartCycle)
                    if let base = charts.base { LabeledContent("Layer", value: base.label) }
                    LabeledContent("Kept for the Air", value: ByteCountFormatter.string(fromByteCount: keptBytes, countStyle: .file))
                } else {
                    LabeledContent("Edition", value: "Fetching…")
                }
                // Regions' charts kept for flying with no signal.
                NavigationLink { DownloadsView() } label: { SettingsLabel("Downloads", systemImage: "arrow.down.circle", colour: WingtipColor.Badge.chart) }
                ProblemLine(charts.problem)
            }
            Section {
                LabeledContent("Server", value: Config.host)
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
                // The build, the data's cycles, the planning aid's words,
                // the credits, the legal pages and the demo flight, as
                // Settings > General > About has them.
                NavigationLink { AboutView() } label: { SettingsLabel("About", systemImage: "info.circle", colour: WingtipColor.Badge.other) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .sheet(isPresented: $signingIn) { SignInView().presentationDetents([.medium, .large]) }
        .task { keptBytes = TileStore.shared.bytes() }
        .refreshable {
            await charts.load()
            await session.refresh()
            keptBytes = TileStore.shared.bytes()
        }
    }
}

#Preview("SetupView") {
    NavigationStack { SetupView() }
        .environment(Session())
        .environment(Charts())
        .environment(Plan())
}
