import Charts
import SwiftUI

/// A flight's height against time and its ground speed where known,
/// Swift Charts: the replay's moment a cursor across it, with a dot on
/// each trace where the airplane is, and a finger drawn along it moves
/// the replay there (the web app's PastFlightChart). The speed is held to
/// the lower half, so the two read apart where both run level, as the
/// web app's are.
struct FlightProfileChart: View {
    @Environment(\.lookAccent) private var accent
    let points: [Replay.Point]
    /// The replay's airplane, where it is.
    var cursor: Replay.Point?
    /// A finger on the profile: the moment under it, s since 1970.
    var onScrub: ((Double) -> Void)?
    @State private var picked: Date?

    /// At most this many points drawn: a long flight's thousands of
    /// reports drawn again with each tick of a replay were the cost, not
    /// the look.
    static let drawn = 400

    private var shown: [Replay.Point] {
        guard points.count > Self.drawn, let last = points.last else { return points }
        let every = (points.count + Self.drawn - 1) / Self.drawn
        return Swift.stride(from: 0, to: points.count, by: every).map { points[$0] } + [last]
    }

    private var top: Double { max(1000, (points.compactMap(\.altFt).max() ?? 0) * 1.25) }
    private var ktTop: Double { max(1, (points.compactMap(\.gsKt).max() ?? 0) * 2.2) }
    private func feet(_ kt: Double) -> Double { kt / ktTop * top }

    var body: some View {
        Chart {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, point in
                if let ft = point.altFt {
                    AreaMark(x: .value("Time", Date(timeIntervalSince1970: point.t)), y: .value("Feet", ft))
                        .foregroundStyle(.linearGradient(colors: [accent.opacity(0.3), accent.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Time", Date(timeIntervalSince1970: point.t)), y: .value("Feet", ft), series: .value("Trace", "Height"))
                        .foregroundStyle(accent)
                }
                if let kt = point.gsKt {
                    LineMark(x: .value("Time", Date(timeIntervalSince1970: point.t)), y: .value("Feet", feet(kt)), series: .value("Trace", "Ground speed"))
                        .foregroundStyle(WingtipInk.caution)
                }
            }
            if let cursor {
                RuleMark(x: .value("Now", Date(timeIntervalSince1970: cursor.t)))
                    .foregroundStyle(Color.primary.opacity(0.5))
                if let ft = cursor.altFt {
                    PointMark(x: .value("Now", Date(timeIntervalSince1970: cursor.t)), y: .value("Feet", ft))
                        .foregroundStyle(accent).symbolSize(60)
                }
                if let kt = cursor.gsKt {
                    PointMark(x: .value("Now", Date(timeIntervalSince1970: cursor.t)), y: .value("Feet", feet(kt)))
                        .foregroundStyle(WingtipInk.caution).symbolSize(60)
                }
            }
        }
        .chartYScale(domain: 0...top)
        .chartYAxisLabel("ft")
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.hour().minute()) } }
        .chartXSelection(value: $picked)
        .onChange(of: picked) { _, date in
            if let date { onScrub?(date.timeIntervalSince1970) }
        }
        .accessibilityLabel("Profile, highest \(SpokenFigures.feet(points.compactMap(\.altFt).max() ?? 0))")
        // Where the replay's airplane is, as the figures over the chart say
        // it; the slider under the chart is the way to move it by VoiceOver.
        .accessibilityValue(cursor.map { "\(ReplaySection.clock($0.t)), \(ReplaySection.spoken($0))" } ?? "")
    }
}
