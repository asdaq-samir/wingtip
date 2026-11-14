import SwiftUI

/// The airport card's tabs as the owner picked them (T4, 2026-11-14,
/// canvas V1d9RDbmY1aczc4LfXed7a, "Airport card tabs"): directly under the
/// four actions, where they are in sight at half height, the picked tab
/// filled in the look's tint. Charts says how many charts the field has
/// (the d-TPP plates and the diagram). Weather's category is said in its
/// name for VoiceOver, "Weather, MVFR"; its colour is the chip in the line
/// under the tabs (AirportWeatherLine), as the stock tabs picker draws a
/// segment's words in one colour and has no room for a coloured dot.
struct AirportTabBar: View {
    @Binding var tab: AirportCard.CardTab
    let place: AirportPlace
    @Environment(\.lookAccent) private var accent

    var body: some View {
        Picker("Section", selection: $tab) {
            ForEach(AirportCard.CardTab.allCases) { tab in
                let hint = Self.hint(tab, place: place)
                Text(tab == .charts && hint != nil ? "\(tab.rawValue) \(hint!)" : tab.rawValue)
                    .accessibilityLabel(hint.map { "\(tab.rawValue), \($0)" } ?? tab.rawValue)
                    .tag(tab)
            }
        }
        .tabsPicker()
        // The picked tab filled in the look's tint, as Fly Here is.
        .tint(accent)
    }

    /// Why to open a tab, said beside its name: Weather the field's own
    /// report's category (the engine's flight_category, as the planner
    /// sends it), none with no report of its own, the nearest station's or
    /// a model's not being this field's; Charts its count, none at 0.
    static func hint(_ tab: AirportCard.CardTab, place: AirportPlace) -> String? {
        switch tab {
        case .weather: place.metar?.flightCategory
        case .charts: chartCount(place).map(String.init)
        default: nil
        }
    }

    /// The charts the Charts tab lists: the d-TPP plates (the diagram's own
    /// APD entry left out) and the diagram once; nil at 0.
    static func chartCount(_ place: AirportPlace) -> Int? {
        let count = (place.procedures ?? []).filter { $0.kind != "APD" }.count + (place.airportDiagramUrl != nil ? 1 : 0)
        return count > 0 ? count : nil
    }
}

/// The field's own report in one line directly under the tabs (T4): its
/// category as a chip in the FAA's colour (AIM 7-1-7, white words on it, as
/// the head's chip), then its ceiling, wind and time (AirportWords.
/// weatherLine), "MVFR  Ceiling 1,800 ft · 310°T 4 kt · 1255Z". Nothing
/// where the field has no report of its own.
struct AirportWeatherLine: View {
    let metar: Metar?

    var body: some View {
        if let metar {
            let category = metar.flightCategory
            let line = AirportWords.weatherLine(metar)
            if category != nil || !line.isEmpty {
                HStack(spacing: WingtipSpace.sm) {
                    if let category {
                        Text(category)
                            .font(WingtipType.detail.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, WingtipSpace.sm)
                            .padding(.vertical, WingtipSpace.xxs)
                            .background(Color(uiColor: FlightCategory.words(category)), in: .capsule)
                            .accessibilityLabel(SpokenFigures.flightCategory(category))
                    }
                    if !line.isEmpty {
                        Text(line).font(WingtipType.detail).foregroundStyle(.secondary).lineLimit(1).monospacedDigit()
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("place-weather-line")
            }
        }
    }
}
