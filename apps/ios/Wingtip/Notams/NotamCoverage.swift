import Foundation

/// The NOTAM list's coverage, said wherever NOTAMs are listed (the Brief's
/// NOTAMs, the route's and a field's NOTAM list, the airport card's), as
/// the web's lib/notamCoverage says it: until the planner holds the FAA's
/// full set (NMS-API's load, decision 0059, amending 0023) it holds only
/// what the FAA's feed has sent since the day it was first heard, so every
/// list says from when, that it is not the full set, and never that there
/// are no NOTAMs. `full` is the answer's `full_set`.
enum NotamCoverage {
    /// The day of an ISO date or time ("2026-10-19", "2026-10-19T06:00:00Z"), UTC.
    static func day(_ since: String?) -> Date? {
        guard let since, since.count >= 10 else { return nil }
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.timeZone = TimeZone(identifier: "UTC")
        parse.dateFormat = "yyyy-MM-dd"
        return parse.date(from: String(since.prefix(10)))
    }

    /// "19 Oct 2026", or "19 Oct" without the year, as the web writes it.
    private static func words(_ day: Date, year: Bool) -> String {
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = year ? "d MMM yyyy" : "d MMM"
        return out.string(from: day)
    }

    /// The line under the NOTAMs: "NOTAMs heard since 19 Oct 2026, not a
    /// full set" while the planner holds only what the feed has sent since
    /// that day; the source's name once it holds every NOTAM in force.
    static func line(since: String?, full: Bool) -> String {
        if full { return String(localized: "FAA NOTAM System, every NOTAM in force") }
        guard let day = day(since) else { return String(localized: "Recent NOTAMs only, not a full set") }
        return String(localized: "NOTAMs heard since \(words(day, year: true)), not a full set")
    }

    /// What an empty list reads, "None heard since 19 Oct": never "no
    /// NOTAMs", which would say none exist when only none were heard;
    /// "None in force" only from the full set.
    static func none(since: String?, full: Bool) -> String {
        if full { return String(localized: "None in force") }
        guard let day = day(since) else { return String(localized: "None heard") }
        return String(localized: "None heard since \(words(day, year: false))")
    }
}
