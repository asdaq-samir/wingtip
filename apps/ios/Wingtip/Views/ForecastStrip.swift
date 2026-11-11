import Charts
import SwiftUI

/// The dry run's forecast strip, under its controls while forecast mode
/// is on (ForecastRun): each leg as flown in the category's colour, as
/// wide as its time, its hour and category under it and a mark where the
/// airplane is; what it meets there and whose forecast that is; the
/// newest alert reached, said by VoiceOver as it comes; and the products
/// the run was played without. Fetching and a failure show in its place.
struct ForecastStrip: View {
    @Environment(DryRun.self) private var dryRun
    @Environment(Verdict.self) private var verdict
    private let forecast = ForecastRun.shared

    /// The run asked for: on, and which run.
    private struct Asked: Equatable {
        let on: Bool
        let start: Date?
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            if let answer = forecast.answer {
                timeline(answer.legs)
                if let here = forecast.here {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text(ForecastPlay.line(here)).font(WingtipType.detail.monospacedDigit())
                        if let source = here.source { Text(source).font(WingtipType.note).foregroundStyle(.secondary) }
                    }
                    .accessibilityElement(children: .combine)
                }
                if let alert = forecast.alert {
                    // The engine's words and its source as sent: the figures
                    // and the rule they cite are its own.
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Label(alert.words, systemImage: "exclamationmark.triangle.fill").font(WingtipType.detail)
                        Text("Source: \(alert.source)").font(WingtipType.note).foregroundStyle(.secondary)
                    }
                    .foregroundStyle(WingtipInk.caution)
                    .accessibilityElement(children: .combine)
                }
                if let without = ForecastPlay.unavailable(answer.unavailable) {
                    Text(without).font(WingtipType.note).foregroundStyle(.secondary)
                }
            } else if let problem = forecast.problem {
                ProblemLine(problem)
            } else {
                HStack(spacing: WingtipSpace.sm) {
                    ProgressView()
                    Text("Fetching the forecast for the run…").font(WingtipType.detail).foregroundStyle(.secondary)
                }
            }
        }
        .padding(WingtipSpace.md)
        .frame(maxWidth: 360, alignment: .leading)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
        .task(id: Asked(on: forecast.on, start: dryRun.startedAt)) {
            await forecast.play(dryRun, minimums: verdict.minimums)
        }
        // An alert is said as it is first reached, as a sighted pilot sees
        // it come in the strip.
        .onChange(of: forecast.alert) { _, alert in
            // Reaching a hazard is felt once, as it is said (ios.md §11).
            if let alert { Announce.alert("\(alert.words) Source: \(alert.source)"); Feel.tap(.warning) }
        }
    }

    /// The legs in their categories, each as wide as its time, in Swift
    /// Charts (stock over the hand-drawn bars, the owner, 2026-11-10): a
    /// bar per leg in its category's colour, the hour it starts (Zulu)
    /// and its category on the axis under it, and a rule at the run's
    /// time now.
    private func timeline(_ legs: [APIRunLeg]) -> some View {
        let start = legs.first?.fromT ?? 0
        let end = max(start + 1, legs.last?.toT ?? start + 1)
        return Chart {
            ForEach(Array(legs.enumerated()), id: \.offset) { _, leg in
                BarMark(xStart: .value("From", leg.fromT), xEnd: .value("To", leg.toT), y: .value("Run", "Run"), height: .fixed(10))
                    .foregroundStyle(Color(FlightCategory.mark(leg.category)))
            }
            // The run's time now, kept on the strip at its ends.
            RuleMark(x: .value("Now", min(end, max(start, forecast.now ?? start))))
                .foregroundStyle(.primary)
                .lineStyle(StrokeStyle(lineWidth: 3))
        }
        .chartXScale(domain: start...end)
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(values: legs.map(\.fromT)) { value in
                AxisValueLabel {
                    if let t = value.as(Double.self), let leg = legs.first(where: { $0.fromT == t }) {
                        Text("\(ForecastPlay.hourZ(t)) \(leg.category ?? "")").font(WingtipType.tabBar.monospacedDigit())
                    }
                }
            }
        }
        .frame(height: 40)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("The forecast along the run")
        .accessibilityValue(legs.map { "from \(ForecastPlay.hourZ($0.fromT)), \(SpokenFigures.flightCategory($0.category))" }.joined(separator: "; "))
    }
}

#Preview("ForecastStrip") {
    ForecastStrip()
        .environment(DryRun())
        .environment(Verdict())
        .padding()
}
