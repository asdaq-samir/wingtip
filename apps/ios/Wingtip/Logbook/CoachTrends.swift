import Foundation

/// The coach's trends, as Apple's Fitness compares the last 90 days with
/// the last 365 (docs/design/ios.md §10): for hours, landings and
/// approaches, whether the last 90 days ran ahead of the year's own pace
/// or behind it, with a line of coaching words. Sums of what the pilot
/// logged, not an aviation rule; the currency itself stays the gateway's
/// and the engine's. A trend needs a few flights in the year before it is
/// shown; until then the coach says how many more (CoachView).
enum CoachTrends {
    /// Flights in the last year before any trend is shown: fewer, and one
    /// flight more or less swings it.
    static let fewestFlights = 5

    enum Way: Equatable { case up, down, steady }

    struct Trend: Equatable, Identifiable {
        let title: String
        /// The last 90 days' total, and the year's total scaled to 90 days.
        let recent: Double
        let pace: Double
        let way: Way
        let words: String
        var id: String { title }
    }

    /// Nil with too few flights in the year; else one trend each for
    /// hours, landings and approaches (approaches only where any are logged).
    static func trends(_ entries: [LogbookEntry], now: Date = Date(), calendar: Calendar = .current) -> [Trend]? {
        guard let yearAgo = calendar.date(byAdding: .day, value: -365, to: now),
              let quarterAgo = calendar.date(byAdding: .day, value: -90, to: now) else { return nil }
        let year = entries.filter { Day.date($0.flownOn).map { $0 > yearAgo && $0 <= now } ?? false }
        guard year.count >= fewestFlights else { return nil }
        let recent = year.filter { Day.date($0.flownOn).map { $0 > quarterAgo } ?? false }
        func trend(_ title: String, _ value: (LogbookEntry) -> Double, unit: String) -> Trend {
            let last = recent.reduce(0) { $0 + value($1) }
            let pace = year.reduce(0) { $0 + value($1) } * 90 / 365
            let way: Way = last > pace * 1.1 ? .up : last < pace * 0.9 ? .down : .steady
            let words = switch way {
            case .up: "More \(unit) in the last 90 days than your year's pace."
            case .down: "Fewer \(unit) in the last 90 days than your year's pace."
            case .steady: "Keeping to your year's pace of \(unit)."
            }
            return Trend(title: title, recent: last, pace: pace, way: way, words: words)
        }
        var list = [trend("Hours", { $0.totalHours }, unit: "hours"),
                    trend("Landings", { Double($0.dayLandings + $0.nightLandings) }, unit: "landings")]
        if year.contains(where: { $0.approaches > 0 }) { list.append(trend("Approaches", { Double($0.approaches) }, unit: "approaches")) }
        return list
    }

    /// How many more flights in the year before trends show.
    static func flightsToGo(_ entries: [LogbookEntry], now: Date = Date(), calendar: Calendar = .current) -> Int {
        guard let yearAgo = calendar.date(byAdding: .day, value: -365, to: now) else { return fewestFlights }
        let year = entries.filter { Day.date($0.flownOn).map { $0 > yearAgo && $0 <= now } ?? false }.count
        return max(0, fewestFlights - year)
    }
}
