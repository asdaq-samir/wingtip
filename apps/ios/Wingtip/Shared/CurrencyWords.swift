import Foundation

/// A currency's line as the Currency Status widget says it, in the
/// Logbook's words (UntilText): "To 3 Dec 2026" while the last good day
/// is today or later, "Ended 3 Dec 2026" after it, "Not current" with
/// none, "From 1 Dec 2026" for an instrument currency not begun yet
/// (14 CFR 61.57(c)(1): approaches flown this month count from the first
/// of the next), and "IPC needed" more than six calendar months past it
/// (61.57(d)). Every day is the gateway's, worked out by the engine
/// (pilot_currency); this only compares them with today's (Day.current).
enum CurrencyWords {
    enum Standing: Equatable, Sendable { case current, notYet, lapsed }

    struct Line: Equatable, Sendable {
        var words: String
        var standing: Standing
    }

    /// A last good day: passengers by day (61.57(a)) or at night
    /// (61.57(b)), the flight review (61.56(c)), the medical (61.23).
    static func until(_ day: String?, today: String = Day.today()) -> Line {
        guard let day else { return Line(words: "Not current", standing: .lapsed) }
        return Day.current(day, today: today)
            ? Line(words: "To \(Day.said(day))", standing: .current)
            : Line(words: "Ended \(Day.said(day))", standing: .lapsed)
    }

    /// Instrument currency (61.57(c), (d)).
    static func instrument(until day: String?, from: String?, ipcNeededAfter: String?, today: String = Day.today()) -> Line {
        if let after = ipcNeededAfter, after < today { return Line(words: "IPC needed", standing: .lapsed) }
        if Day.current(day, today: today), let from, from > today { return Line(words: "From \(Day.said(from))", standing: .notYet) }
        return until(day, today: today)
    }
}
