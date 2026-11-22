import SwiftUI

/// Whose each weather line on the side view is and for when, under it, as
/// the web's WeatherKey: the TAFs' cloud bases (the station and its TAF's
/// issue time), the freezing level's forecast (its model run and the hour
/// it is read for) and the G-AIRMETs' icing (valid and issued), each in
/// its line's colour; a product the planner could not read said so,
/// unknown rather than none.
struct ProfileWeatherKey: View {
    let weather: ProfileWeather?

    struct Line: Equatable {
        enum Kind: Equatable { case cloud, icing, unknown }
        let kind: Kind
        let words: String
    }

    var body: some View {
        let lines = Self.lines(weather)
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                ForEach(lines, id: \.words) { line in
                    HStack(spacing: WingtipSpace.xs) {
                        Capsule().fill(Self.colour(line.kind)).frame(width: 12, height: 2).accessibilityHidden(true)
                        Text(line.words)
                    }
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .accessibilityElement(children: .combine)
        }
    }

    static func colour(_ kind: Line.Kind) -> Color {
        switch kind {
        case .cloud: Color(uiColor: WingtipColor.Weather.mountains)
        case .icing: Color(uiColor: WingtipColor.Weather.icing)
        case .unknown: Color(uiColor: WingtipColor.Chart.fieldUnknown)
        }
    }

    /// The key's lines, in the web's order and words, each figure the app's
    /// own way of writing it (Format).
    static func lines(_ weather: ProfileWeather?) -> [Line] {
        guard let weather else { return [] }
        var lines = weather.clouds.map { cloud in
            Line(kind: .cloud, words: "Ceiling \(Format.altitude(cloud.baseFt)) · \(cloud.station) TAF\(zulu(cloud.issued, " "))")
        }
        if let source = weather.freezingSource, let low = weather.freezing.map(\.ft).min() {
            let ran = zulu(source.run, " ")
            let run = ran.isEmpty ? "" : "\(ran) run"
            let at = zulu(source.validAt, ", for ")
            lines.append(Line(kind: .icing, words: "Freezing level from \(Format.altitude(low)) · \(source.label)\(run)\(at)"))
        }
        for ice in weather.icing {
            let low = ice.fromFreezingLevel == true ? "FZL" : Format.grouped(ice.lowFt ?? 0)
            let band = "\(low)–\(Format.altitude(ice.highFt ?? 0))"
            lines.append(Line(kind: .icing, words: "Icing \(band) · G-AIRMET\(zulu(ice.validAt, " for "))\(zulu(ice.issued, ", issued "))"))
        }
        for gone in weather.unavailable ?? [] {
            let what = switch gone {
            case "clouds": "Cloud bases"
            case "freezing": "Freezing level"
            default: "Icing"
            }
            lines.append(Line(kind: .unknown, words: "\(what) not available"))
        }
        return lines
    }

    /// An ISO time as reports give it, "1120Z", after `lead`; "" with none.
    private static func zulu(_ iso: String?, _ lead: String) -> String {
        AirportWords.date(iso).map { lead + Format.zulu($0) } ?? ""
    }
}
