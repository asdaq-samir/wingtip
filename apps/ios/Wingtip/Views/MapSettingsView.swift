import SwiftUI

/// The Map card, the map's own button's (MapButtons), as Maps' Choose Map
/// card: what the map draws and how it warns, every switch in place (the
/// owner's card rule, 2026-11-10, "a Map settings card reachable from the
/// map's own button"). The one home of the map's switches and the alerts
/// (docs/decisions/0014); Settings' Map row opens this same card.
struct MapSettingsView: View {
    @Environment(Traffic.self) private var traffic
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true
    @AppStorage(MapExtrasInput.Keys.military) private var militaryOn = false
    @AppStorage(MapExtrasInput.Keys.privateFields) private var privateOn = false

    var body: some View {
        List {
            // No header of its own: the card's large title already says
            // Map (the iOS sheet audit, 2026-11-10).
            Section {
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
                    // Turned on, every plate hidden from its card is back.
                    .onChange(of: platesOn) { _, on in if on { HiddenPlates.shared.showAll() } }
                Toggle("Military Fields", isOn: $militaryOn)
                Toggle("Private Fields", isOn: $privateOn)
                // Each field's weather on its mark: the halo, the dot or
                // the station model, the wind arrows and the ↓.
                AirportWeatherRows()
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
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Map")
    }
}

#Preview("MapSettingsView") {
    NavigationStack { MapSettingsView() }
        .environment(Traffic())
}
