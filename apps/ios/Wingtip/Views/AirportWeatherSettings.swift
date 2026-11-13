import SwiftUI

/// Settings' Airport Weather, one menu (the owner, 2026-11-13, as the
/// web's lib/map/marks/airportWeatherPrefs): Off, no weather mark on any
/// field (the owner's 2026-11-10 pick, put back); the flight category's
/// ring alone; the ring with the wind -- its barbs farther out and the
/// station model zoomed in close -- the default; or the station model
/// wherever it fits. ForeFlight's Dot went, and the three switches that
/// were under the look; the amber ↓ at a plan's field whose weather gets
/// worse by the pilot's time there is drawn with every choice but Off.
enum AirportWeather: String, CaseIterable, Identifiable, Sendable {
    case off, category, wind, station

    /// The one key the menu is kept under, beside the map's other switches.
    static let key = "map.airportWeather.show"
    static let standard = AirportWeather.wind

    var id: String { rawValue }

    /// The menu's words, the web's own.
    var label: LocalizedStringResource {
        switch self {
        case .off: "Off"
        case .category: "Flight Category"
        case .wind: "With Wind"
        case .station: "Station Model"
        }
    }

    /// What the map draws for it (the web's airportWeatherDrawn).
    var choice: AirportWeatherChoice {
        switch self {
        case .off: AirportWeatherChoice(style: .off, stationClose: false, windBarbs: false, worse: false)
        case .category: AirportWeatherChoice(style: .halo, stationClose: false, windBarbs: false, worse: true)
        case .wind: AirportWeatherChoice(style: .halo, stationClose: true, windBarbs: true, worse: true)
        case .station: AirportWeatherChoice(style: .station, stationClose: true, windBarbs: true, worse: true)
        }
    }

    /// The choice kept, else what a device kept before the menu brought to
    /// one of its choices, as the web migrates it: Off kept, the station
    /// model kept, the ring with its barbs With Wind, the rest -- the ring
    /// alone, the dot -- the flight category.
    static func kept(_ defaults: UserDefaults = .standard) -> AirportWeather {
        if let kept = defaults.string(forKey: key).flatMap(AirportWeather.init(rawValue:)) { return kept }
        guard let old = defaults.string(forKey: Legacy.style) else { return standard }
        switch old {
        case "off": return .off
        case "station": return .station
        case "halo": return defaults.object(forKey: Legacy.windArrows) as? Bool == false ? .category : .wind
        default: return .category
        }
    }

    /// The keys the look and its three switches were kept under, read
    /// once to bring a device's choice over.
    enum Legacy {
        static let style = "map.airportWeather"
        static let windArrows = "map.airportWeather.windArrows"
    }
}

/// How a field's weather looks on its mark: none, the ring in its flight
/// category's colour round the chart's own symbol, or the station model.
enum AirportWeatherStyle: String, Sendable {
    case off, halo, station
}

/// The settings as the map reads them, all at once.
struct AirportWeatherChoice: Equatable, Sendable {
    var style: AirportWeatherStyle = .halo
    var stationClose = true
    var windBarbs = true
    var worse = true

    /// The station model drawn: at every zoom with Station, from the zoom
    /// its lines fit (the token WingtipMap.zoomStationClose, as on the web
    /// and Android) With Wind, never with Off or the flight category alone.
    func station(zoom: Double) -> Bool {
        switch style {
        case .off: false
        case .station: true
        case .halo: stationClose && zoom >= WingtipMap.zoomStationClose
        }
    }
}

/// Settings' Map row for it: a menu, as a discrete setting is (CLAUDE.md;
/// the web's pull-down), its pick at the row's end.
struct AirportWeatherRow: View {
    @AppStorage(AirportWeather.key) private var show = AirportWeather.kept().rawValue

    var body: some View {
        Picker("Airport Weather", selection: $show) {
            ForEach(AirportWeather.allCases) { Text($0.label).tag($0.rawValue) }
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier("airport-weather-look")
    }
}

#Preview("AirportWeatherRow") {
    List { Section("Map") { AirportWeatherRow() } }
}
