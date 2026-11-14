import Foundation
import Observation

/// The airport card's NOTAMs, its view model (the web's fieldNotams and
/// notamBadges): the field's own NOTAMs and the TFRs within 5 nm of it,
/// best first as the engine ranks them (/api/airport/{ident}/notams), each
/// read once by the engine for a pilot (notam_read, tfr_read), and what
/// each one in force addresses on the card (notam_subject). 14 CFR 91.103
/// asks for the NOTAMs of every field a flight uses; a card is where a
/// pilot looks at one field. Nothing here is a rule: every word and every
/// badge is the engine's.
@MainActor @Observable
final class FieldNotams {
    /// The section's first few, the engine's top three (notams_ranked says
    /// its top three first), the title the way to the rest, as the web's.
    static let first = 3

    private(set) var ident = ""
    private(set) var ranked: APINotamsRanked?
    /// Where they couldn't be had, said where they go: none shown must not
    /// read as none in force.
    private(set) var problem: String?
    /// The section opened to every one, by kind.
    var all = false
    /// The NOTAMs a badge opened as a page of the card's stack, for a badge
    /// whose row's own tap does something else (an approach's plate) and
    /// for the card's head.
    var opened: OpenNotams?
    private(set) var readings: [String: EngineContract.NotamReadAnswer] = [:]
    private(set) var tfrs: [String: EngineContract.TfrReadAnswer] = [:]
    private(set) var marks = NotamMarks()
    private var place: AirportPlace?

    var notams: [APIRankedNotam] { ranked?.notams ?? [] }
    var long: Bool { notams.count > Self.first }
    var shown: [APIRankedNotam] { all || !long ? notams : Array(notams.prefix(Self.first)) }

    /// The field's NOTAMs, kept for the air, read and marked on the card.
    func load(_ ident: String, force: Bool = false) async {
        if ident != self.ident { all = false }
        self.ident = ident
        do {
            let fresh = try await KeptForAir.answer(.notams, key: KeptForAir.fieldNotamsKey(ident)) { try await Planner.notams(ident) }.value
            await take(fresh, for: ident)
        } catch {
            if ranked == nil || force {
                problem = "Its NOTAMs couldn't be had, so closures and TFRs aren't shown: \(error.localizedDescription)"
            }
        }
    }

    /// The answer read: each NOTAM by notam_read, each TFR by tfr_read,
    /// once, off the main actor (a busy field has dozens), and taken while
    /// the card still shows the field.
    private func take(_ fresh: APINotamsRanked, for ident: String) async {
        let read = await Self.read(fresh.notams, idents: FieldNotamWords.idents(ident))
        guard ident == self.ident else { return }
        ranked = fresh
        problem = nil
        readings = read.readings
        tfrs = read.tfrs
        remark()
    }

    @concurrent
    private nonisolated static func read(_ notams: [APIRankedNotam], idents: [String]) async
        -> (readings: [String: EngineContract.NotamReadAnswer], tfrs: [String: EngineContract.TfrReadAnswer]) {
        var readings: [String: EngineContract.NotamReadAnswer] = [:]
        var tfrs: [String: EngineContract.TfrReadAnswer] = [:]
        for notam in notams {
            if notam.kind == "tfr" {
                tfrs[notam.id] = try? FieldNotamWords.readTfr(notam)
            } else {
                readings[notam.id] = try? Engine.notamRead(text: notam.raw, idents: idents)
            }
        }
        return (readings, tfrs)
    }

    /// What the empty list says of a field outside the NOTAM system: a
    /// private one NASR gives no NOTAM_ID (the engine's
    /// airport_notams_none); nil where "none heard" is right.
    var outsideNotams: String? {
        guard let place else { return nil }
        return try? Engine.airportNotamsNone(private: place.isPrivate, military: place.military, notamId: place.notamId)
    }

    /// Who may land at a field and where its figures come from, the engine's
    /// airport_use_words and airport_data_words, each kept as a Result so a
    /// failure is shown, not read as none.
    static func useWords(_ place: AirportPlace) -> Result<EngineContract.AirportUseWordsAnswer, Error> {
        Result { try Engine.airportUseWords(private: place.isPrivate, military: place.military) }
    }

    static func dataWords(_ place: AirportPlace) -> Result<String?, Error> {
        Result { try Engine.airportDataWords(dataSource: place.dataSource, infoDate: place.infoDate) }
    }

    /// The card's place, which the badges go next to.
    func attach(_ place: AirportPlace?) {
        guard place != self.place else { return }
        self.place = place
        remark()
    }

    private func remark() {
        marks = FieldNotamWords.marks(notams, ident: ident, place: place)
    }

    func reading(_ notam: APIRankedNotam) -> EngineContract.NotamReadAnswer? { readings[notam.id] }
    func tfr(_ notam: APIRankedNotam) -> EngineContract.TfrReadAnswer? { tfrs[notam.id] }

    /// Its first line: what it is and its condition in our words (notam_read's
    /// what), else its words written out; a TFR's kind and rule (tfr_read).
    func what(_ notam: APIRankedNotam) -> String {
        if notam.kind == "tfr" { return tfr(notam)?.what ?? "TFR" }
        guard let read = reading(notam) else { return NotamRows.summary(notam) }
        return read.what ?? read.words
    }

    /// Where it is, only where that is not obvious: a NOTAM's place off
    /// the field, a TFR's levels and where it is from the field.
    func place(_ notam: APIRankedNotam) -> String? {
        notam.kind == "tfr" ? tfr(notam)?.where : reading(notam)?.where
    }

    /// The heading of its own page: what kind it is ("Runway", "Security TFR").
    func heading(_ notam: APIRankedNotam) -> String {
        notam.kind == "tfr" ? (tfr(notam)?.heading ?? "TFR") : (reading(notam)?.heading ?? "NOTAM")
    }

    /// Its time lines (FieldNotamWords.timeLines), now.
    func times(_ notam: APIRankedNotam, now: Date = .now) -> [FieldNotamWords.TimeLine] {
        FieldNotamWords.timeLines(notam, read: reading(notam), now: now)
    }

    /// The NOTAMs by what they are about, the engine's heading (Runway,
    /// Taxiway, Obstacle ...; a TFR's "TFR"), each kind where its first ranks.
    func kinds(_ notams: [APIRankedNotam]) -> [(kind: String, notams: [APIRankedNotam])] {
        var order: [String] = []
        var by: [String: [APIRankedNotam]] = [:]
        for notam in notams {
            let kind = notam.kind == "tfr" ? "TFR" : (reading(notam)?.heading ?? "Other")
            if by[kind] == nil { order.append(kind) }
            by[kind, default: []].append(notam)
        }
        return order.map { ($0, by[$0] ?? []) }
    }

    /// The NOTAMs a mark opened, by their ids, in its order.
    func notams(_ open: OpenNotams) -> [APIRankedNotam] {
        open.ids.compactMap { id in notams.first { $0.id == id } }
    }
}

/// Which NOTAMs a tap on a badge opens, as a page of the card's stack.
struct OpenNotams: Hashable, Identifiable {
    let ids: [String]
    var id: [String] { ids }
}

/// A badge on one of the card's things: the engine's word, how bad, what it
/// says, and the NOTAMs in force on it, the worst's first.
struct NotamMark: Equatable {
    var word: String
    var severity: String
    var label: String
    var notams: [APIRankedNotam]

    /// Closed or not to be used: red; otherwise the caution's colours.
    var unusable: Bool { severity == "unusable" }
    var open: OpenNotams { OpenNotams(ids: notams.map(\.id)) }
}

/// The card's badges by what they are next to: the field and its fuel, its
/// runways, lights and frequencies by their index in the place's lists,
/// its approaches by their chart's address.
struct NotamMarks: Equatable {
    var field: NotamMark?
    var fuel: NotamMark?
    var runway: [Int: NotamMark] = [:]
    var light: [Int: NotamMark] = [:]
    var frequency: [Int: NotamMark] = [:]
    var approach: [String: NotamMark] = [:]
}

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
