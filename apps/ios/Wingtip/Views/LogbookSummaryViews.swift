import Charts
import SwiftUI

/// The logbook's summary sections, as Health's Summary has Highlights and
/// Trends under what is pinned (docs/design/ios.md §9). The sums are
/// LogbookSummary's, of what the pilot logged; nothing is worked out here.

/// This month's hours, landings and approaches, one facts row.
struct LogbookHighlightsSection: View {
    let entries: [LogbookEntry]

    var body: some View {
        let h = LogbookSummary.highlights(entries)
        Section("This Month") {
            FactsRow(facts: [
                .init(label: "Hours", value: Format.number(h.hours, decimals: 1), spoken: SpokenFigures.number(h.hours, decimals: 1) + " hours"),
                .init(label: "Flights", value: "\(h.flights)"),
                .init(label: "Landings", value: "\(h.landings)"),
                .init(label: "Approaches", value: "\(h.approaches)"),
            ])
            .padding(.vertical, WingtipSpace.xs)
        }
    }
}

/// The hours flown, a bar a week, month or year, from zero (HIG Charts:
/// bars start at zero), the period switched by the tabs above the chart.
/// Swift Charts gives VoiceOver its Audio Graph.
struct LogbookTrendSection: View {
    let entries: [LogbookEntry]
    @Binding var period: LogbookSummary.Period

    var body: some View {
        let bars = LogbookSummary.trend(entries, period: period)
        Section("Trends") {
            Picker("Period", selection: $period) {
                ForEach(LogbookSummary.Period.allCases) { Text($0.rawValue).tag($0) }
            }
            .tabsPicker()
            Chart(bars) { bar in
                BarMark(x: .value("From", bar.start, unit: period.unit), y: .value("Hours", bar.hours))
                    .foregroundStyle(.tint)
                    .accessibilityLabel(Self.spokenStart(bar.start, period))
                    .accessibilityValue(SpokenFigures.number(bar.hours, decimals: 1) + " hours")
            }
            .chartYScale(domain: .automatic(includesZero: true))
            .chartYAxisLabel("h")
            .frame(height: 160)
            .accessibilityLabel("Hours flown by \(period.rawValue.lowercased())")
        }
    }

    private static func spokenStart(_ date: Date, _ period: LogbookSummary.Period) -> String {
        switch period {
        case .week: "Week of " + date.formatted(date: .abbreviated, time: .omitted)
        case .month: date.formatted(.dateTime.month(.wide).year())
        case .year: date.formatted(.dateTime.year())
        }
    }
}
