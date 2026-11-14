import SwiftUI

/// The Map card, the map's own button's (MapButtons), as Apple Maps'
/// Choose Map card: what is on the map and nothing else (the owner's
/// option A, 2026-11-13; docs/design/rules.md §8) -- the charts as
/// pictures, None first (the owner, 2026-11-14: "chart should also have
/// none option"), the approach plates' switch under them while a chart is
/// drawn; then exactly four layers as tiles (the owner, 2026-11-14: "can
/// we just have four layers aeronautical, weather, traffic,
/// private/military in the map settings?"), the weather's own picks --
/// the radar loop and the model weather -- under them while Weather is
/// on; then the app's Look, its Theme and Appearance (the owner,
/// 2026-11-14, moved from Settings so each control has one home). The
/// TFRs, the public fields, the route and own ship have no switch: always
/// drawn. The route's checkpoints and the Class B fields' weather are the
/// route's ••• menu's (RouteOnMapToggles). How the map behaves -- the
/// airport weather, the glide ring, the alerts, the data kept -- is the
/// app's Settings, which the gear at the card's top left opens at its Map
/// group, pushed in this card so its Back comes back here.
///
/// No overlay row: the USGS's imagery already comes in under the chart by
/// itself close in (CloseImagery), and Google's map tiles are the web's
/// and Android's, not drawn on the iPhone (AboutModel).
struct MapSettingsView: View {
    @Environment(Navigator.self) private var nav
    @Environment(Charts.self) private var charts
    @Environment(Traffic.self) private var traffic
    @Environment(WeatherLoop.self) private var loop
    @Environment(ModelWeather.self) private var model
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true
    @AppStorage(MapExtrasInput.Keys.aeronautical) private var aeronauticalOn = true
    @AppStorage(MapExtrasInput.Keys.weather) private var weatherOn = true
    @AppStorage(MapExtrasInput.Keys.military) private var militaryOn = false
    @AppStorage(MapExtrasInput.Keys.privateFields) private var privateOn = false

    var body: some View {
        List {
            Section("Chart") {
                ChartPictures(choices: charts.choices, picked: Bindable(charts).picked)
                if charts.picked != Charts.none {
                    Toggle("Approach Plates", isOn: $platesOn)
                        .accessibilityIdentifier("layer-plates")
                        // Turned on, every plate hidden from its card is back.
                        .onChange(of: platesOn) { _, on in if on { HiddenPlates.shared.showAll() } }
                }
            }
            Section("Layers") {
                HStack(spacing: WingtipSpace.sm) {
                    LayerTile("Aeronautical", id: "layer-aeronautical", systemImage: "hexagon", isOn: $aeronauticalOn)
                    LayerTile("Weather", id: "layer-weather", systemImage: "cloud.sun", isOn: $weatherOn)
                    LayerTile("Traffic", id: "layer-traffic", systemImage: WingtipIcon.airplane, isOn: Bindable(traffic).on)
                    // The private and military fields together, drawn
                    // whatever this says while Emergency is open (MapExtras).
                    LayerTile("Private/\u{200B}Military", id: "layer-private-military", systemImage: "lock.circle",
                              isOn: Binding(get: { privateOn || militaryOn }, set: { privateOn = $0; militaryOn = $0 }))
                }
                .padding(.vertical, WingtipSpace.xs)
                // Off, the weather's own picks go with it.
                .onChange(of: weatherOn) { _, on in
                    if !on {
                        loop.kind = .off
                        model.field = .off
                    }
                }
                if weatherOn {
                    // The radar and satellite loop and its speed (WeatherLoop).
                    WeatherLoopRows()
                    // The model weather's field and its level (ModelWeather).
                    ModelWeatherRows()
                }
            }
            Section("Look") {
                ThemeRow()
                AppearanceRow()
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

/// The route's checkpoints and the Class B fields' weather chips, the
/// route's ••• menu's On the Map (the owner, 2026-11-14: "Let's not enable
/// waypoints for a pilot"), each off by default.
struct RouteOnMapToggles: View {
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false

    var body: some View {
        Section("On the Map") {
            Toggle("Checkpoints", isOn: $waypointsOn)
            Toggle("Class B Weather", isOn: $classBOn)
        }
    }
}

/// The base charts as pictures, four to a row with None, as Apple Maps' Choose Map
/// shows its maps: each the chart's own picture (the web's public/map-tiles,
/// cut from one tile of the cycle's charts over Chicago), its name under
/// it, the one drawn ringed in the tint.
struct ChartPictures: View {
    let choices: [ChartLayer]
    @Binding var picked: String
    @Environment(\.lookAccent) private var accent

    var body: some View {
        HStack(alignment: .top, spacing: WingtipSpace.sm) {
            none
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

    /// None, first: the plain ground the overlays draw over.
    private var none: some View {
        let on = picked == Charts.none
        return Button { picked = Charts.none } label: {
            VStack(spacing: WingtipSpace.xs) {
                RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous)
                    .fill(Color(.secondarySystemBackground))
                    .aspectRatio(16 / 10, contentMode: .fit)
                    .overlay { Image(systemName: "map").font(.title3).foregroundStyle(.secondary) }
                    .overlay {
                        RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous)
                            .strokeBorder(on ? accent : Color(.separator), lineWidth: on ? 3 : 1)
                    }
                Text("None").font(WingtipType.detail).foregroundStyle(on ? accent : .primary)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("base-chart-none")
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
        .environment(WeatherLoop.shared)
        .environment(ModelWeather.shared)
        .environment(Navigator())
        .environment(FlightSession())
}
