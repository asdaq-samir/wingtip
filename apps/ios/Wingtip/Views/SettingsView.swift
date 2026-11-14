import SwiftUI

/// The app's Settings, one page (the owner's pick of option A of the
/// account canvas, 2026-11-13; docs/design/rules.md §8): how the app
/// behaves, in groups as iOS's Settings has them -- Look, Map, In Flight,
/// Data, and Help & About. Pushed from You's gear, and from the Map card's
/// gear at its Map group, so the system's Back goes back to the card it
/// was opened from. The one thing called Settings: every control in one
/// home, where they were Setup's rows and the Map card's switches.
///
/// No Sunlight here: the web's sunlight scheme is its own high-contrast
/// stylesheet, switched by a light sensor the iPhone gives no app; iOS's
/// own Increase Contrast and auto-brightness do that job on the phone.
struct SettingsView: View {
    /// Opened from the Map card's gear: scrolled to its Map group.
    let atMap: Bool
    @Environment(Session.self) private var session
    @Environment(Charts.self) private var charts
    @Environment(FlightSession.self) private var flight
    @State private var keptBytes: Int64 = 0

    var body: some View {
        ScrollViewReader { reader in
            List {
                Section("Look") {
                    ThemeRow()
                    AppearanceRow()
                }
                Section("Map") {
                    AirportWeatherRow()
                    // The glide ring about own ship, off unless turned on
                    // (the owner, 2026-11-09).
                    GlideRingToggle()
                    // Own ship's path flown put away: it starts again with
                    // the next flight.
                    Button("Clear Your Path") { flight.ownShip.trail.clear() }
                        .disabled(flight.ownShip.trail.points.count < 2)
                        .accessibilityIdentifier("own-trail-clear")
                }
                .id(SettingsView.mapGroup)
                Section("In Flight") {
                    NavigationLink { AlertsPage() } label: { Text("Alerts") }
                        .accessibilityIdentifier("alerts-row")
                    NavigationLink { AtcPage() } label: { Text("ATC") }
                        .accessibilityIdentifier("atc-row")
                }
                Section("Data") {
                    // The charts along a route and its briefing kept for
                    // flying with no signal (KeepForAir, FPL's button), and
                    // whole regions' charts (Downloads).
                    LabeledContent("Kept for the Air", value: ByteCountFormatter.string(fromByteCount: keptBytes, countStyle: .file))
                    NavigationLink { DownloadsView() } label: { Text(Screen.downloads.title) }
                    // A Stratux, Sentry or the like on the cockpit's Wi-Fi:
                    // its traffic and FIS-B weather with no internet.
                    ReceiverModePicker()
                    ForgetNotesButton()
                }
                Section {
                    NavigationLink { HelpPage() } label: { Text("Help & About") }
                        .accessibilityIdentifier("help-row")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Settings")
            .onAppear { if atMap { reader.scrollTo(SettingsView.mapGroup, anchor: .top) } }
        }
        .task { keptBytes = TileStore.shared.bytes() }
    }

    static let mapGroup = "settings-map"
}

/// The in-flight alerts: what is ahead said aloud (the flight's voice).
struct AlertsPage: View {
    var body: some View {
        List { SpokenAlertsToggle() }
            .listStyle(.insetGrouped)
            .navigationTitle("Alerts")
    }
}

/// Comms Assist's switch, kept on this device, off by default (the owner,
/// 2026-11-13: "make it a setting instead"): with it off the radio's
/// button is not drawn.
enum CommsAssist {
    static let key = "atc.commsAssist"
}

/// The radio, one page (the owner, 2026-11-13: Comms Assist, the ATC
/// alerts and the copilot together): Comms Assist's button, the ATC
/// copilot listening while flying (not offered where speech cannot be
/// recognised on the iPhone), and the in-flight copilot.
struct AtcPage: View {
    @Environment(ClearanceListener.self) private var listener
    @AppStorage(CommsAssist.key) private var commsAssist = false

    var body: some View {
        List {
            Toggle("Comms Assist", isOn: $commsAssist)
                .accessibilityIdentifier("comms-assist-toggle")
            if listener.canListen {
                LabeledContent("ATC Alerts") { AtcModePicker().fixedSize() }
            }
            LabeledContent("Copilot") { CopilotModePicker().fixedSize() }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("ATC")
    }
}

/// Help & About, one row of Settings (the owner, 2026-11-13): the guide,
/// about and where the map's data comes from, then the server and the
/// version, and the legal pages at the foot.
struct HelpPage: View {
    var body: some View {
        List {
            Section {
                NavigationLink { PilotGuideView() } label: { Text(Screen.guide.title) }
                    .accessibilityIdentifier("guide-link")
                NavigationLink { AboutView() } label: { Text(Screen.about.title) }
                    .accessibilityIdentifier("about-link")
                NavigationLink { SourcesPage() } label: { Text("Sources") }
                    .accessibilityIdentifier("sources-row")
            }
            Section {
                LabeledContent("Server", value: Config.host)
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
            }
            Section {
                Link("Privacy", destination: AboutModel.page("privacy"))
                Link("Terms", destination: AboutModel.page("terms"))
                NavigationLink { AboutView() } label: { Text("Legal") }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Help & About")
    }
}

/// Where the map's data comes from and how old it is: the chart's edition
/// and layer, then each weather layer's source and age.
struct SourcesPage: View {
    @Environment(Charts.self) private var charts

    var body: some View {
        List {
            Section("Chart") {
                if let info = charts.info {
                    LabeledContent("Edition", value: info.chartCycle)
                    if let base = charts.base { LabeledContent("Layer", value: base.label) }
                } else {
                    LabeledContent("Edition", value: "Fetching…")
                }
                ProblemLine(charts.problem)
            }
            Section("Weather and Traffic") { LayerAgesRows() }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Sources")
    }
}

#Preview("SettingsView") {
    NavigationStack { SettingsView(atMap: false) }
        .environment(Session())
        .environment(Charts())
        .environment(FlightSession())
}
