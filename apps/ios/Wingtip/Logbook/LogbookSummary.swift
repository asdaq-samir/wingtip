import Foundation

/// The logbook's own sums for its summary, as Health's Summary gives its
/// highlights and trends (docs/design/ios.md §9): the hours, landings and
/// approaches the pilot logged this month, the hours by week, month or
/// year for the trend chart, and the flights by month for the list. Sums
/// of what the pilot wrote, not an aviation rule: currency stays the
/// gateway's (/api/logbook/currency, until #482 moves it to the engine).
/// Apart from the view so the tests read it (LogbookEntriesModelTests).
enum LogbookSummary {
    /// This month's totals, by the day each flight was flown.
    struct Highlights: Equatable {
        var hours = 0.0
        var landings = 0
        var approaches = 0
        var flights = 0
    }

    /// The trend chart's periods, as Health's tabs at the top.
    enum Period: String, CaseIterable, Identifiable {
        case week = "Week", month = "Month", year = "Year"
        var id: String { rawValue }

        /// Each bar's span, and how many bars back from now.
        var unit: Calendar.Component {
            switch self {
            case .week: .weekOfYear
            case .month: .month
            case .year: .year
            }
        }

        var bars: Int {
            switch self {
            case .week: 12
            case .month: 12
            case .year: 5
            }
        }
    }

    /// One bar: the start of its span and the hours logged in it.
    struct Bar: Equatable, Identifiable {
        let start: Date
        let hours: Double
        var id: Date { start }
    }

    /// One month's flights, newest month first: "November 2026".
    struct Month: Equatable, Identifiable {
        let title: String
        let entries: [LogbookEntry]
        var id: String { title }
    }

    static func highlights(_ entries: [LogbookEntry], now: Date = Date(), calendar: Calendar = .current) -> Highlights {
        var h = Highlights()
        for e in entries {
            guard let day = Day.date(e.flownOn), calendar.isDate(day, equalTo: now, toGranularity: .month) else { continue }
            h.hours += e.totalHours
            h.landings += e.dayLandings + e.nightLandings
            h.approaches += e.approaches
            h.flights += 1
        }
        return h
    }

    /// The hours in each of the period's last spans, oldest first, an
    /// empty span a bar of zero so the chart's axis runs from zero (HIG
    /// Charts).
    static func trend(_ entries: [LogbookEntry], period: Period, now: Date = Date(), calendar: Calendar = .current) -> [Bar] {
        guard let current = calendar.dateInterval(of: period.unit, for: now)?.start else { return [] }
        let starts = (0..<period.bars).reversed().compactMap { calendar.date(byAdding: period.unit, value: -$0, to: current) }
        var hours = [Date: Double]()
        for e in entries {
            guard let day = Day.date(e.flownOn), let start = calendar.dateInterval(of: period.unit, for: day)?.start else { continue }
            hours[start, default: 0] += e.totalHours
        }
        return starts.map { Bar(start: $0, hours: hours[$0] ?? 0) }
    }

    /// The flights grouped by the month they were flown, newest first,
    /// keeping only those the search names (route, airplane, type or
    /// remarks).
    static func months(_ entries: [LogbookEntry], matching query: String = "", calendar: Calendar = .current) -> [Month] {
        let words = query.trimmingCharacters(in: .whitespaces)
        let kept = entries.filter { e in
            words.isEmpty || [e.route, e.aircraft, e.aircraftType, e.remarks].contains { $0?.localizedCaseInsensitiveContains(words) == true }
        }
        let title = DateFormatter()
        title.calendar = calendar
        title.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        var order: [String] = []
        var by: [String: [LogbookEntry]] = [:]
        for e in kept.sorted(by: { $0.flownOn > $1.flownOn }) {
            let name = Day.date(e.flownOn).map(title.string(from:)) ?? e.flownOn
            if by[name] == nil { order.append(name) }
            by[name, default: []].append(e)
        }
        return order.map { Month(title: $0, entries: by[$0] ?? []) }
    }
}
