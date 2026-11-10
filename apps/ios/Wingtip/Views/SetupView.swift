import SwiftUI

/// Settings, the account button's page (Setup's rows, the owner's
/// one-search design, 2026-11-09): the pilot's account, the flying
/// screens, the map's switches, the alerts, the look, and the chart's
/// edition and what of it is kept for the air. A page of the sheet's
/// stack; its rows open their pages on it. Laid out as iOS's Settings
/// (docs/design/ios.md §13): a large title, the pilot first (AccountHeadRow,
/// their account a page of its own with Delete Account last), then the
/// groups as they were, each row led by a badge-coloured square. No Save:
/// every row keeps itself as it changes.
struct SetupView: View {
    @Environment(Session.self) private var session
    @Environment(Charts.self) private var charts
    @Environment(Traffic.self) private var traffic
    @Environment(Plan.self) private var plan
    @State private var signingIn = false
    @State private var keptBytes: Int64 = 0
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true
    @AppStorage(MapExtrasInput.Keys.military) private var militaryOn = false
    @AppStorage(MapExtrasInput.Keys.privateFields) private var privateOn = false
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
                NavigationLink { ChecklistsPage().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel(Screen.checklists.title, systemImage: "checklist", colour: WingtipColor.Badge.ground) }
                NavigationLink { FlightsView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel(Screen.flights.title, systemImage: "tray.full", colour: WingtipColor.Badge.tower) }
                NavigationLink { OwnAircraftListView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel(Screen.airplanes.title, systemImage: WingtipIcon.airplane, colour: WingtipColor.Badge.approach) }
                NavigationLink { PracticeView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Practice", systemImage: "figure.walk.motion", colour: WingtipColor.Badge.traffic) }
            }
            if session.signedIn {
                Section("Pilot") {
                    NavigationLink { LogbookView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Logbook and Currency", systemImage: "book", colour: WingtipColor.Badge.fuel) }
                    NavigationLink { TrainingView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Training", systemImage: "graduationcap", colour: WingtipColor.Badge.lodging) }
                    NavigationLink { InstructorView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Instructing", systemImage: "person.2", colour: WingtipColor.Badge.ground) }
                    NavigationLink { CoachView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Coach", systemImage: "brain.head.profile", colour: WingtipColor.Badge.food) }
                }
            }
            // The weather the pilot will not take off or land in, kept
            // on this phone: the Brief's Go / No-Go holds it to them.
            // Here alone (docs/decisions/0014, one home per control): the
            // Brief's own link to it is gone (the UI audit, 2026-11-09).
            Section {
                NavigationLink { MinimumsView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Personal Minimums", systemImage: "cloud.sun", colour: WingtipColor.Badge.weather) }
                NavigationLink { PilotGuideView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Guide", systemImage: "questionmark.circle", colour: WingtipColor.Badge.rule) }
                // The first launch's welcome, shown again from here alone.
                Button("Show Welcome Again") { WelcomeModel.shared.again() }
            }
            Section("Map") {
                Toggle("Traffic", isOn: Binding(get: { traffic.on }, set: { traffic.on = $0 }))
                // The glide ring outside an emergency (the owner's pick
                // of its place, 2026-11-09); off by default.
                GlideRingToggle()
                // A Stratux, Sentry or the like on the cockpit's Wi-Fi:
                // its traffic and FIS-B weather with no internet.
                ReceiverModePicker()
                SpokenAlertsToggle()
                ForgetNotesButton()
                Toggle("VFR Waypoints", isOn: $waypointsOn)
                Toggle("Class B Weather", isOn: $classBOn)
                Toggle("Approach Plates", isOn: $platesOn)
                Toggle("Military Fields", isOn: $militaryOn)
                Toggle("Private Fields", isOn: $privateOn)
                // The radar and satellite loop and its speed (WeatherLoop).
                WeatherLoopRows()
                // How old each weather layer's data is.
                LayerAgesRows()
            }
            // The in-flight copilot, off, shown or said aloud, beside the
            // alerts as the same kind of choice (the web's Alerts group).
            Section("Alerts") {
                LabeledContent("Copilot") { CopilotModePicker().fixedSize() }
                // The ATC copilot: the radio listened to while flying,
                // calls to us read into cards; off until turned on, and
                // not offered where speech cannot be recognised on the iPhone.
                if ClearanceListener.shared.canListen {
                    LabeledContent("ATC") { AtcModePicker().fixedSize() }
                }
            }
            // The plan under the one search, or the strip: the flight
            // as one strip in time under the same search
            // (StripSheetView), the owner's pick of 2026-11-04, tried
            // beside it; a segmented control, as a setting of two is.
            Section("Screen") {
                Picker("Screen", selection: $layoutName) {
                    Text("Plan").tag("plan")
                    Text("Strip").tag("strip")
                }
                .pickerStyle(.segmented)
            }
            // The look: the brand's by default, Glass Cockpit and Chart
            // Ink kept to pick (the owner, 2026-11-09), and Native, iOS's
            // own (2026-11-10); a menu, as a discrete setting is
            // (docs/decisions/0017).
            Section("Look") {
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
                NavigationLink { DownloadsView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("Downloads", systemImage: "arrow.down.circle", colour: WingtipColor.Badge.chart) }
                ProblemLine(charts.problem)
            }
            Section {
                LabeledContent("Server", value: Config.host)
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
                // The build, the data's cycles, the planning aid's words,
                // the credits, the legal pages and the demo flight, as
                // Settings > General > About has them.
                NavigationLink { AboutView().navigationBarTitleDisplayMode(.inline) } label: { SettingsLabel("About", systemImage: "info.circle", colour: WingtipColor.Badge.other) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .sheet(isPresented: $signingIn) { SignInView() }
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
        .environment(Traffic())
        .environment(Plan())
}
