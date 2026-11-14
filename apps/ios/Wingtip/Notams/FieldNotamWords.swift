import Foundation
import Observation

/// The NOTAM card's words and times, apart from the views so the tests
/// read them (FieldNotamsTests). The web's fieldNotams and notamTimes.
enum FieldNotamWords {
    /// The field's idents as a NOTAM may write them ("OSH", "KOSH").
    static func idents(_ ident: String) -> [String] {
        let bare = ident.count == 4 && ident.hasPrefix("K") ? String(ident.dropFirst()) : ident
        var seen: [String] = []
        for one in [ident, bare, "K\(bare)"] where !seen.contains(one) { seen.append(one) }
        return seen
    }

    /// Its number as a briefer reads it, the field's own name off it on the
    /// field's card ("11/060", not "ORD 11/060"); another place's kept.
    static func number(_ notam: APIRankedNotam, ident: String) -> String {
        guard let own = idents(ident).first(where: { notam.id.hasPrefix("\($0) ") }) else { return notam.id }
        return String(notam.id.dropFirst(own.count + 1))
    }

    /// A TFR read by the engine (tfr_read) from what tfr.faa.gov gives of it.
    static func readTfr(_ notam: APIRankedNotam) throws -> EngineContract.TfrReadAnswer {
        let t = notam.tfr
        return try Engine.tfrRead(kind: t?.kind, rule: t?.rule, title: t?.title, floorFt: t?.floorFt, floorRef: t?.floorRef,
                                  ceilingFt: t?.ceilingFt, ceilingRef: t?.ceilingRef, overField: t?.overField,
                                  field: t?.field.map { .init(lat: $0.lat, lon: $0.lon) }, edge: t?.edge.map { .init(lat: $0.lat, lon: $0.lon) })
    }

    /// What each NOTAM in force addresses on the card, as the engine reads
    /// it (notam_subject: JO 7930.2's keywords and conditions matched to the
    /// card's own runways, lights, approaches and frequencies). One not yet
    /// in force has none: it is in the list, marked Inactive (the owner,
    /// 2026-11-11: "If notam is not active, no need to put a caution badge
    /// on the thing").
    static func marks(_ notams: [APIRankedNotam], ident: String, place: AirportPlace?) -> NotamMarks {
        let approaches = (place?.procedures ?? []).filter { $0.kind == "IAP" }
        let runways = (place?.runways ?? []).map { $0.ends ?? "" }
        let lights = (place?.lights ?? []).map { EngineContract.NotamSubjectInputLightsItem(code: $0.code, name: $0.name, runways: $0.runways) }
        let frequencies = (place?.frequencies ?? []).map { EngineContract.NotamSubjectInputFrequenciesItem(type: $0.type, mhz: $0.frequencyMhz) }
        var marks = NotamMarks()
        for notam in notams where notam.inForce != false {
            guard let badges = try? Engine.notamSubject(text: notam.raw, tfr: notam.kind == "tfr", idents: idents(ident), runways: runways,
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

    /// One labelled line of a NOTAM's times: "Since", "Starts", "Ends", "Duration".
    struct TimeLine: Equatable {
        let label: String
        let value: String
    }

    /// "11/10 06:00": month/day and the 24-hour clock in the device's own
    /// time, as a pilot writes it on a kneeboard, the zone not named (the
    /// owner, 2026-11-11: "No need to mention time zone, just say local").
    static func corner(_ at: Date, local: Bool, in zone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let style = Date.VerbatimFormatStyle(
            format: "\(month: .twoDigits)/\(day: .twoDigits) \(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)",
            locale: Locale(identifier: "en_US_POSIX"), timeZone: zone, calendar: calendar)
        return at.formatted(style) + (local ? " local" : "")
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

    /// A NOTAM's times on lines of their own, labelled, in the device's own
    /// time with "local" once, as ForeFlight's NOTAM list gives them (the
    /// owner's screenshots, 2026-11-11): one in force "Since" its start and
    /// "Ends" with how long is left ("(in 18d)"); one to come "Starts" with
    /// how soon, "Ends", and how long it lasts. An estimated end "(est.)",
    /// PERM "Permanent" (JO 7930.2 4-2-1). The times are the planner's,
    /// else the NOTAM's own as the engine read them.
    static func timeLines(_ notam: APIRankedNotam, read: EngineContract.NotamReadAnswer?, now: Date = .now,
                          in zone: TimeZone = .current) -> [TimeLine] {
        let starts = date(notam.starts ?? read?.starts), ends = date(notam.ends ?? read?.ends)
        let active = notam.inForce != false
        func soon(_ at: Date) -> String { at > now ? " (in \(span(at.timeIntervalSince(now))))" : "" }
        var lines: [TimeLine] = []
        if let starts {
            lines.append(TimeLine(label: active ? "Since" : "Starts", value: corner(starts, local: ends == nil, in: zone) + (active ? "" : soon(starts))))
        }
        if let ends {
            lines.append(TimeLine(label: "Ends", value: corner(ends, local: true, in: zone) + (read?.estimated == true ? " (est.)" : "") + soon(ends)))
        } else if read?.permanent == true {
            lines.append(TimeLine(label: "Ends", value: "Permanent"))
        }
        if !active, let starts, let ends { lines.append(TimeLine(label: "Duration", value: span(ends.timeIntervalSince(starts)))) }
        return lines
    }
}
