import Foundation

/// A day as the gateway sends one ("2026-10-25", the pilot's own
/// calendar day) and as the pages say it; compiled into the widgets too
/// (Currency Status), which say the same days the same way.
nonisolated enum Day {
    // Foundation's format styles, not DateFormatter: Sendable values,
    // safe in a static and from any thread (the widgets' timelines too).
    private static let calendar = Calendar(identifier: .gregorian)
    private static let posix = Locale(identifier: "en_US_POSIX")
    private static func isoStyle(in zone: TimeZone) -> Date.ISO8601FormatStyle {
        Date.ISO8601FormatStyle(timeZone: zone).year().month().day()
    }
    private static let iso = isoStyle(in: .current)
    private static let page = Date.VerbatimFormatStyle(
        format: "\(day: .defaultDigits) \(month: .abbreviated) \(year: .defaultDigits)",
        locale: posix, timeZone: .current, calendar: calendar)
    private static let ac = Date.VerbatimFormatStyle(
        format: "\(month: .twoDigits)-\(day: .twoDigits)-\(year: .defaultDigits)",
        locale: posix, timeZone: .current, calendar: calendar)

    /// The day a moment falls on in the pilot's own calendar, as the
    /// gateway and the planner read one; in another zone where asked.
    static func string(_ date: Date, in zone: TimeZone = .current) -> String {
        date.formatted(zone == iso.timeZone ? iso : isoStyle(in: zone))
    }
    static func date(_ day: String) -> Date? { try? iso.parse(String(day.prefix(10))) }
    static func today() -> String { string(Date()) }
    /// "13 Oct 2026", as the web app's pages say a day.
    static func said(_ day: String) -> String { date(day).map { $0.formatted(page) } ?? day }
    /// "10-13-2026", as AC 61-65K's samples write one.
    static func acDay(_ day: String) -> String { date(day).map { $0.formatted(ac) } ?? day }
    /// Whether a last good day is today or later. The days are the
    /// gateway's; the app only compares them with today's.
    static func current(_ through: String?, today: String = Day.today()) -> Bool {
        guard let through else { return false }
        return String(through.prefix(10)) >= today
    }
}
