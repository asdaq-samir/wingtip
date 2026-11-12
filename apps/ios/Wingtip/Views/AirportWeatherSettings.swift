import SwiftUI

/// How the map marks each field's weather (the owner's pick, 2026-11-10,
/// the "Recommended" artboard): a ring in the flight category's colour
/// round the chart's own symbol by default; ForeFlight's filled dot in
/// place of the symbol; the station model at every zoom it fits; or
/// nothing. Kept on the device with the map's other switches.
enum AirportWeatherStyle: String, CaseIterable, Identifiable, Sendable {
    case off, halo, dot, station

    var id: String { rawValue }

    /// The segment's word, a resource so the string catalog gathers it.
    var label: LocalizedStringResource {
        switch self {
        case .off: "Off"
        case .halo: "Halo"
        case .dot: "Dot"
        case .station: "Station"
        }
    }

    /// The keys of the four settings and their first values: Halo, and
    /// every switch on (the spec's defaults). The barbs' switch keeps the
    /// key the arrows' had, as the web keeps its stored key.
    enum Keys {
        static let style = "map.airportWeather"
        static let stationClose = "map.airportWeather.stationClose"
        static let windArrows = "map.airportWeather.windArrows"
        static let worse = "map.airportWeather.worse"
    }
}

/// The settings as the map reads them, all four at once.
struct AirportWeatherChoice: Equatable, Sendable {
    var style: AirportWeatherStyle = .halo
    var stationClose = true
    var windBarbs = true
    var worse = true

    /// The station model drawn: at every zoom with Station, from the zoom
    /// its lines fit (StationModel.fromZoom) with the switch on, never with
    /// Off.
    func station(zoom: Double) -> Bool {
        switch style {
        case .off: false
        case .station: true
        case .halo, .dot: stationClose && zoom >= StationModel.fromZoom
        }
    }
}

/// The Map section's rows for it: the style as a segmented control, as a
/// discrete setting of four is (docs/decisions/0017), and the three
/// switches under it.
struct AirportWeatherRows: View {
    @AppStorage(AirportWeatherStyle.Keys.style) private var style = AirportWeatherStyle.halo.rawValue
    @AppStorage(AirportWeatherStyle.Keys.stationClose) private var stationClose = true
    @AppStorage(AirportWeatherStyle.Keys.windArrows) private var windBarbs = true
    @AppStorage(AirportWeatherStyle.Keys.worse) private var worse = true

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            Text("Airport Weather")
            Picker("Airport Weather", selection: $style) {
                ForEach(AirportWeatherStyle.allCases) { Text($0.label).tag($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
        Toggle("Station Model When Zoomed In", isOn: $stationClose)
            .disabled(style == AirportWeatherStyle.off.rawValue || style == AirportWeatherStyle.station.rawValue)
        Toggle("Wind Barbs", isOn: $windBarbs)
            .disabled(style == AirportWeatherStyle.off.rawValue)
        Toggle("Getting Worse by Arrival", isOn: $worse)
            .disabled(style == AirportWeatherStyle.off.rawValue)
    }
}

#Preview("AirportWeatherRows") {
    List { Section("Map") { AirportWeatherRows() } }
}
