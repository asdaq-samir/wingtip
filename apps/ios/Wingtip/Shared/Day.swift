import Foundation

/// A day as the gateway sends one ("2026-10-25", the pilot's own
/// calendar day) and as the pages say it; compiled into the widgets too
/// (Currency Status), which say the same days the same way.
enum Day {
    private static func formatter(_ format: String, in zone: TimeZone = .current) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = format
        return f
    }
    private static let iso = formatter("yyyy-MM-dd")
    private static let page = formatter("d MMM yyyy")
    private static let ac = formatter("MM-dd-yyyy")

    /// The day a moment falls on in the pilot's own calendar, as the
    /// gateway and the planner read one; in another zone where asked.
    static func string(_ date: Date, in zone: TimeZone = .current) -> String {
        zone == iso.timeZone ? iso.string(from: date) : formatter("yyyy-MM-dd", in: zone).string(from: date)
    }
    static func date(_ day: String) -> Date? { iso.date(from: String(day.prefix(10))) }
    static func today() -> String { string(Date()) }
    /// "13 Oct 2026", as the web app's pages say a day.
    static func said(_ day: String) -> String { date(day).map { page.string(from: $0) } ?? day }
    /// "10-13-2026", as AC 61-65K's samples write one.
    static func acDay(_ day: String) -> String { date(day).map { ac.string(from: $0) } ?? day }
    /// Whether a last good day is today or later. The days are the
    /// gateway's; the app only compares them with today's.
    static func current(_ through: String?, today: String = Day.today()) -> Bool {
        guard let through else { return false }
        return String(through.prefix(10)) >= today
    }
}
