import Charts
import SwiftUI

/// What the side view draws over its ground beside the airspace, as the
/// web's ProfileHazards: each DOF obstacle a post from its ground to its
/// top (its AMSL less its AGL), in the ground's red or amber where the
/// engine says it comes near the altitude shown (`profile_obstacles`), the
/// tallest named as the sectional prints an obstacle, MSL over AGL in
/// brackets (FAA Aeronautical Chart User's Guide, Obstructions); each TAF
/// station's forecast cloud base a dashed bar at the station; the freezing
/// level a dashed line along the route; and the icing G-AIRMETs (AIM
/// 7-1-6) as bands between their altitudes, from the freezing level where
/// they say FZL. Whose each line is and for when is the key under the
/// chart (ProfileWeatherKey). Nothing is worked out here.
struct ProfileHazardMarks: ChartContent {
    let obstacles: [ProfileRules.Obstacle]
    let weather: ProfileWeather?
    let lengthNm: Double
    /// The chart's top, ft: a line over it is not drawn pinned to it.
    let top: Double

    /// How wide a station's cloud base is drawn, a share of the route
    /// either side: a mark at the station, not a deck (the web's CLOUD_HALF).
    static let cloudHalf = 0.05

    private var freezing: [APIProfileFreezing] { (weather?.freezing ?? []).filter { $0.ft <= top } }

    var body: some ChartContent {
        let lowest = freezing.map(\.ft).min()
        ForEach(Array((weather?.icing ?? []).enumerated()), id: \.offset) { _, ice in
            let low = ice.lowFt ?? (ice.fromFreezingLevel == true ? lowest : nil) ?? 0
            RectangleMark(xStart: .value("From", ice.fromNm), xEnd: .value("To", ice.toNm),
                          yStart: .value("Low", low), yEnd: .value("High", min(ice.highFt ?? low, top)))
                .foregroundStyle(Color(uiColor: WingtipColor.Weather.icing).opacity(0.14))
                .accessibilityHidden(true)
        }
        if freezing.count > 1 {
            ForEach(Array(freezing.enumerated()), id: \.offset) { _, point in
                LineMark(x: .value("Along", point.alongNm), y: .value("Freezing", point.ft), series: .value("Line", "Freezing"))
                    .foregroundStyle(Color(uiColor: WingtipColor.Weather.icing))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                    .accessibilityHidden(true)
            }
        }
        ForEach((weather?.clouds ?? []).filter { $0.baseFt <= top }, id: \.station) { cloud in
            RuleMark(xStart: .value("From", max(0, cloud.alongNm - Self.cloudHalf * lengthNm)),
                     xEnd: .value("To", min(lengthNm, cloud.alongNm + Self.cloudHalf * lengthNm)),
                     y: .value("Base", cloud.baseFt))
                .foregroundStyle(Color(uiColor: WingtipColor.Weather.mountains))
                .lineStyle(StrokeStyle(lineWidth: 3, dash: [4, 2]))
                .accessibilityHidden(true)
        }
        ForEach(Array(obstacles.enumerated()), id: \.offset) { _, obstacle in
            RuleMark(x: .value("Along", obstacle.alongNm),
                     yStart: .value("Ground", obstacle.amslFt - (obstacle.aglFt ?? 0)), yEnd: .value("Top", obstacle.amslFt))
                .foregroundStyle(Color(uiColor: Self.colour(obstacle.level)))
                .lineStyle(StrokeStyle(lineWidth: 1.5))
                .annotation(position: .top, spacing: WingtipSpace.xxs) {
                    if obstacle.named { Text(Self.name(obstacle)).font(.caption2.monospacedDigit()).foregroundStyle(.secondary) }
                }
                .accessibilityHidden(true)
        }
    }

    /// The engine's level in the ground's colours: red, amber, else the
    /// chart's obstacle ink.
    static func colour(_ level: String?) -> UIColor {
        switch level {
        case "warning": WingtipColor.Chart.warning
        case "caution": WingtipColor.Chart.caution
        default: WingtipColor.Chart.obstacle
        }
    }

    /// An obstacle's heights as the sectional prints them: "2,049 (1,549)".
    static func name(_ obstacle: ProfileRules.Obstacle) -> String {
        Format.grouped(obstacle.amslFt) + (obstacle.aglFt.map { " (\(Format.grouped($0)))" } ?? "")
    }
}
