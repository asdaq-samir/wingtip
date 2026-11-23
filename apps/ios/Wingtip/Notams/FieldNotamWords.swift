import Foundation
import Observation

/// The NOTAM card's words and times, apart from the views so the tests
/// read them (FieldNotamsTests). The web's fieldNotams and notamTimes.
enum FieldNotamWords {
    /// The field's idents as a NOTAM may write them ("OSH", "KOSH"): the
    /// engine's field_names (FAA JO 7350.9GG 4-1).
    static func idents(_ ident: String) throws -> [String] {
        try Engine.fieldNames(ident: ident)
    }

    /// Its number as a briefer reads it, the field's own name (`idents`)
    /// off it on the field's card ("11/060", not "ORD 11/060"); another
    /// place's kept.
    static func number(_ notam: APIRankedNotam, idents: [String]) -> String {
        guard let own = idents.first(where: { notam.id.hasPrefix("\($0) ") }) else { return notam.id }
        return String(notam.id.dropFirst(own.count + 1))
    }

    /// A TFR read by the engine (tfr_read) from what tfr.faa.gov gives of it.
    nonisolated static func readTfr(_ notam: APIRankedNotam) throws -> EngineContract.TfrReadAnswer {
        let t = notam.tfr
        return try Engine.tfrRead(kind: t?.kind, rule: t?.rule, title: t?.title, floorFt: t?.floorFt, floorRef: t?.floorRef,
                                  ceilingFt: t?.ceilingFt, ceilingRef: t?.ceilingRef, overField: t?.overField,
                                  field: t?.field.map { .init(lat: $0.lat, lon: $0.lon) }, edge: t?.edge.map { .init(lat: $0.lat, lon: $0.lon) })
    }

    /// A TFR from tfr.faa.gov's list read by the engine (tfr_read), for
    /// its card (TfrCard): its altitudes and where, and the rule it is
    /// under; nil where the engine cannot read it.
    static func readTfr(_ tfr: APITfr) -> EngineContract.TfrReadAnswer? {
        try? Engine.tfrRead(kind: tfr.kind, rule: tfr.rule, floorFt: tfr.floorFt, floorRef: tfr.floorRef,
                            ceilingFt: tfr.ceilingFt, ceilingRef: tfr.ceilingRef)
    }

    /// What each NOTAM in force addresses on the card, as the engine reads
    /// it (notam_subject: JO 7930.2's keywords and conditions matched to the
    /// card's own runways, lights, approaches and frequencies). One not yet
    /// in force has none: it is in the list, marked Inactive (the owner,
    /// 2026-11-11: "If notam is not active, no need to put a caution badge
    /// on the thing").
    static func marks(_ notams: [APIRankedNotam], idents: [String], place: AirportPlace?) -> NotamMarks {
        let approaches = (place?.procedures ?? []).filter { $0.kind == "IAP" }
        let runways = (place?.runways ?? []).map { $0.ends ?? "" }
        let lights = (place?.lights ?? []).map { EngineContract.NotamSubjectInputLightsItem(code: $0.code, name: $0.name, runways: $0.runways) }
        let frequencies = (place?.frequencies ?? []).map { EngineContract.NotamSubjectInputFrequenciesItem(type: $0.type, mhz: $0.frequencyMhz) }
        var marks = NotamMarks()
        for notam in notams where notam.inForce != false {
            guard let badges = try? Engine.notamSubject(text: notam.raw, tfr: notam.kind == "tfr", idents: idents, runways: runways,
                                                        lights: lights, approaches: approaches.map(\.name), frequencies: frequencies).badges
            else { continue }
            for badge in badges {
                let i = badge.index ?? -1
                switch badge.on {
                case "field": marks.field = add(marks.field, badge, notam)
                case "fuel": marks.fuel = add(marks.fuel, badge, notam)
                case "approach":
                    if approaches.indices.contains(i) { marks.approach[approaches[i].url] = add(marks.approach[approaches[i].url], badge, notam) }
                case "runway": marks.runway[i] = add(marks.runway[i], badge, notam)
                case "light": marks.light[i] = add(marks.light[i], badge, notam)
                case "frequency": marks.frequency[i] = add(marks.frequency[i], badge, notam)
                default: continue
                }
            }
        }
        return marks
    }

    /// One more NOTAM on a thing: its badge where it is the worse (a
    /// closure over a caution), else the first's, in the engine's order.
    private static func add(_ prior: NotamMark?, _ badge: EngineContract.NotamSubjectAnswerBadgesItem, _ notam: APIRankedNotam) -> NotamMark {
        guard var prior else { return NotamMark(word: badge.word, severity: badge.severity, label: badge.label, notams: [notam]) }
        let notams = prior.notams.contains { $0.id == notam.id } ? prior.notams : prior.notams + [notam]
        if prior.severity == "caution", badge.severity == "unusable" {
            return NotamMark(word: badge.word, severity: badge.severity, label: badge.label, notams: [notam] + notams.filter { $0.id != notam.id })
        }
        prior.notams = notams
        return prior
    }

    /// One labelled line of a NOTAM's times: "Since", "Starts", "Ends",
    /// "Duration"; `soon` how long until it ("in 18d"), which the line
    /// drops where it would not fit on one line (NotamTimeLinesView).
    struct TimeLine: Equatable {
        let label: String
        let value: String
        var soon: String?
    }

    /// "05/27/26 13:43 CDT": month/day, the year only where `year`, and
    /// the 24-hour clock in the field's own time with its zone's short
    /// name (the owner, 2026-11-23: "no need to say the word local or Z
    /// time. Just say the time zone like CST for O'Hare"); "05/27 18:43
    /// UTC" where the field's zone is not known, never the device's own
    /// time called the field's. `clock` false says the day alone.
    static func when(_ at: Date, zone: TimeZone?, year: Bool, clock: Bool = true) -> String {
        let tz = zone ?? .gmt
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tz
        let locale = Locale(identifier: "en_US")
        let day = year
            ? Date.VerbatimFormatStyle(format: "\(month: .twoDigits)/\(day: .twoDigits)/\(year: .twoDigits)", locale: locale, timeZone: tz, calendar: calendar)
            : Date.VerbatimFormatStyle(format: "\(month: .twoDigits)/\(day: .twoDigits)", locale: locale, timeZone: tz, calendar: calendar)
        guard clock else { return at.formatted(day) }
        let time = Date.VerbatimFormatStyle(format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)",
                                            locale: locale, timeZone: tz, calendar: calendar)
        return "\(at.formatted(day)) \(at.formatted(time)) \(zone.map { Format.zoneName($0, at: at) } ?? "UTC")"
    }

    /// Whether a NOTAM's times say their year: where either end is not
    /// this year's (the owner, 2026-11-23, FDC 6/3373's end two years on),
    /// the years counted in the zone the dates are shown in (`when`), so a
    /// date near New Year is never shown without the year it needs.
    static func withYear(_ dates: [Date?], now: Date, zone: TimeZone? = nil) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone ?? .gmt
        let thisYear = calendar.component(.year, from: now)
        return dates.contains { $0.map { calendar.component(.year, from: $0) != thisYear } ?? false }
    }

    /// How long, as ForeFlight writes it: "5m" under an hour, "5h05m" under
    /// a day, "4d16h" under ten, "18d" past them.
    static func span(_ seconds: TimeInterval) -> String {
        let minutes = max(0, Int((seconds / 60).rounded()))
        let (d, h, m) = (minutes / 1440, minutes % 1440 / 60, minutes % 60)
        if d >= 10 { return "\(d)d" }
        if d >= 1 { return h > 0 ? "\(d)d\(h)h" : "\(d)d" }
        return h > 0 ? "\(h)h" + String(format: "%02dm", m) : "\(m)m"
    }

    /// A feed's time as a date, one with no zone read as UTC.
    static func date(_ text: String?) -> Date? {
        guard let text, !text.isEmpty else { return nil }
        return (try? Date(text, strategy: .iso8601)) ?? (try? Date(text + "Z", strategy: .iso8601))
    }

    /// A NOTAM's times, a line each, on its row and on its own card alike
    /// (the web's one timeLines), in the field's own time with its zone
    /// (`when`), as ForeFlight's NOTAM list gives them (the owner's
    /// screenshots, 2026-11-11): one in force "Since" its start and "Ends"
    /// with how long is left; one to come "Starts" with how soon, "Ends",
    /// and how long it lasts. An EST end is said as its time alone (the
    /// owner, 2026-11-23: "no need for the word estimated"). Where the
    /// engine's notam_card says it runs until the charts are updated
    /// (`untilCharts`: PERM with an EST end or none, JO 7930.2 4-2-1), its
    /// end is "Permanent" (the owner, 2026-11-23: "For a permanent, just say
    /// permanent"), as is a PERM end. The times are the planner's, else the
    /// NOTAM's own as the engine read them.
    static func timeLines(_ notam: APIRankedNotam, read: EngineContract.NotamReadAnswer?, untilCharts: Bool, zone: TimeZone?,
                          now: Date = .now) -> [TimeLine] {
        let starts = date(notam.starts ?? read?.starts), ends = date(notam.ends ?? read?.ends)
        let active = notam.inForce != false
        let year = withYear([starts, ends], now: now, zone: zone)
        func soon(_ at: Date) -> String? { at > now ? "in \(span(at.timeIntervalSince(now)))" : nil }
        var lines: [TimeLine] = []
        if let starts {
            lines.append(TimeLine(label: active ? "Since" : "Starts", value: when(starts, zone: zone, year: year), soon: active ? nil : soon(starts)))
        }
        if untilCharts || (ends == nil && read?.permanent == true) {
            lines.append(TimeLine(label: "Ends", value: "Permanent"))
        } else if let ends {
            lines.append(TimeLine(label: "Ends", value: when(ends, zone: zone, year: year), soon: soon(ends)))
        }
        if !active, !untilCharts, let starts, let ends {
            lines.append(TimeLine(label: "Duration", value: span(ends.timeIntervalSince(starts))))
        }
        return lines
    }
}
