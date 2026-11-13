import SwiftUI

/// The Map card, the map's own button's (MapButtons), as Apple Maps'
/// Choose Map card: what is on the map and nothing else (the owner's
/// option A, 2026-11-13; docs/design/rules.md §8) -- the charts as
/// pictures, then the layers as tiles, then the weather layers with more
/// than two choices as menus. How the map behaves -- the airport weather,
/// the glide ring, the alerts, the data kept, where it comes from -- is
/// the app's Settings, which the gear at the card's top left opens at its
/// Map group, pushed in this card so its Back comes back here.
///
/// No overlay row: the USGS's imagery already comes in under the chart by
/// itself close in (CloseImagery), and Google's map tiles are the web's
/// and Android's, not drawn on the iPhone (AboutModel).
struct MapSettingsView: View {
    @Environment(Navigator.self) private var nav
    @Environment(Charts.self) private var charts
    @Environment(Traffic.self) private var traffic
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true
    @AppStorage(MapExtrasInput.Keys.military) private var militaryOn = false
    @AppStorage(MapExtrasInput.Keys.privateFields) private var privateOn = false

    var body: some View {
        List {
            if !charts.choices.isEmpty {
                Section("Chart") {
                    ChartPictures(choices: charts.choices, picked: Bindable(charts).picked)
                }
            }
            Section("Layers") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: WingtipSpace.sm), count: 3), spacing: WingtipSpace.sm) {
                    LayerTile("Traffic", id: "layer-traffic", systemImage: WingtipIcon.airplane, isOn: Bindable(traffic).on)
                    LayerTile("VFR Waypoints", id: "layer-waypoints", systemImage: "triangle", isOn: $waypointsOn)
                    LayerTile("Class B Weather", id: "layer-class-b", systemImage: "cloud.sun", isOn: $classBOn)
                    LayerTile("Approach Plates", id: "layer-plates", systemImage: "doc.richtext", isOn: $platesOn)
                        // Turned on, every plate hidden from its card is back.
                        .onChange(of: platesOn) { _, on in if on { HiddenPlates.shared.showAll() } }
                    LayerTile("Private Fields", id: "layer-private", systemImage: "r.circle", isOn: $privateOn)
                    LayerTile("Military Fields", id: "layer-military", systemImage: "m.circle", isOn: $militaryOn)
                }
                .padding(.vertical, WingtipSpace.xs)
            }
            Section {
                // The radar and satellite loop and its speed (WeatherLoop).
                WeatherLoopRows()
                // The model weather's field and its level (ModelWeather).
                ModelWeatherRows()
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Map")
        .toolbar {
            // Settings at its Map group, at the card's top left as Apple
            // Maps' cards put their leading button (the owner, 2026-11-13:
            // "a settings button on the top left side of both overlay and
            // avatar"), the close at the right.
            ToolbarItem(placement: .topBarLeading) {
                SettingsGear { nav.push(.settings(atMap: true)) }
            }
        }
    }
}

/// The base charts as pictures, three to a row, as Apple Maps' Choose Map
/// shows its maps: each the chart's own picture (the web's public/map-tiles,
/// cut from one tile of the cycle's charts over Chicago), its name under
/// it, the one drawn ringed in the tint.
struct ChartPictures: View {
    let choices: [ChartLayer]
    @Binding var picked: String
    @Environment(\.lookAccent) private var accent

    var body: some View {
        HStack(alignment: .top, spacing: WingtipSpace.sm) {
            ForEach(choices, id: \.kind) { layer in
                let on = layer.kind == picked
                Button { picked = layer.kind } label: {
                    VStack(spacing: WingtipSpace.xs) {
                        Image("chart-\(layer.kind)")
                            .resizable()
                            .aspectRatio(16 / 10, contentMode: .fill)
                            .clipShape(RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous)
                                    .strokeBorder(on ? accent : Color(.separator), lineWidth: on ? 3 : 1)
                            }
                        Text(Self.name(layer.kind, layer.label))
                            .font(WingtipType.detail)
                            .foregroundStyle(on ? accent : .primary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
                .accessibilityIdentifier("base-chart-\(layer.kind)")
            }
        }
        .padding(.vertical, WingtipSpace.xs)
    }

    /// The web's names for its three charts (BASE_CHARTS), else the planner's.
    static func name(_ kind: String, _ label: String) -> String {
        switch kind {
        case "sec": "Sectional"
        case "ifr_low": "IFR Low"
        case "ifr_high": "IFR High"
        default: label
        }
    }
}

/// A layer on or off: the stock toggle in its button style, tinted while
/// on as Control Center's tiles are, its glyph over its name.
struct LayerTile: View {
    let title: LocalizedStringResource
    let id: String
    let systemImage: String
    @Binding var isOn: Bool

    init(_ title: LocalizedStringResource, id: String, systemImage: String, isOn: Binding<Bool>) {
        self.title = title
        self.id = id
        self.systemImage = systemImage
        _isOn = isOn
    }

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(spacing: WingtipSpace.xs) {
                Image(systemName: systemImage).font(.title3)
                Text(title).font(WingtipType.note).multilineTextAlignment(.center).lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget * 1.5)
        }
        .toggleStyle(.button)
        .buttonStyle(.bordered)
        .buttonBorderShape(.roundedRectangle(radius: WingtipRadius.badge))
        .accessibilityIdentifier(id)
    }
}

/// Settings' gear, the leading button of the Map card and of You.
struct SettingsGear: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) { Image(systemName: "gearshape") }
            .accessibilityLabel("Settings")
            .accessibilityIdentifier("settings-gear")
    }
}

#Preview("MapSettingsView") {
    NavigationStack { MapSettingsView() }
        .environment(Traffic())
        .environment(Charts())
        .environment(Navigator())
        .environment(FlightSession())
}
