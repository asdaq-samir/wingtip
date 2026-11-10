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
            if let alert { Announce.alert("\(alert.words) Source: \(alert.source)") }
        }
    }

    /// The legs in their categories, each as wide as its time, labelled
    /// with the hour it starts (Zulu) and its worst category, and a mark
    /// at the run's time now.
    private func timeline(_ legs: [APIRunLeg]) -> some View {
        let total = max(1, (legs.last?.toT ?? 0) - (legs.first?.fromT ?? 0))
        let at = ForecastPlay.fraction(legs, at: forecast.now ?? 0)
        return VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            GeometryReader { box in
                HStack(spacing: WingtipSpace.hairline) {
                    ForEach(Array(legs.enumerated()), id: \.offset) { _, leg in
                        Rectangle().fill(Color(FlightCategory.mark(leg.category)))
                            .frame(width: max(2, box.size.width * (leg.toT - leg.fromT) / total - 1))
                    }
                }
                .clipShape(Capsule())
                .overlay(alignment: .leading) {
                    Capsule().fill(.primary).frame(width: 3, height: 18)
                        .offset(x: min(box.size.width - 3, max(0, box.size.width * at - 1.5)))
                }
                .frame(height: 10)
                .frame(maxHeight: .infinity)
            }
            .frame(height: 18)
            GeometryReader { box in
                HStack(spacing: 0) {
                    ForEach(Array(legs.enumerated()), id: \.offset) { _, leg in
                        let width = box.size.width * (leg.toT - leg.fromT) / total
                        Text("\(ForecastPlay.hourZ(leg.fromT)) \(leg.category ?? "")")
                            .font(WingtipType.tabBar.monospacedDigit()).foregroundStyle(.secondary)
                            .lineLimit(1).fixedSize()
                            .frame(width: width, alignment: .leading).clipped()
                            // Only where the leg is wide enough to say it.
                            .opacity(width >= 44 ? 1 : 0)
                    }
                }
            }
            .frame(height: 16)
        }
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
