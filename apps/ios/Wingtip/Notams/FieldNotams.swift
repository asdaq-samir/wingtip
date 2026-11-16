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
    /// airport_notams_none); nil where "none heard" is right. A Result, so
    /// a failed rule is said rather than read as "none heard".
    var outsideNotams: Result<String?, any Error> {
        guard let place else { return .success(nil) }
        return Result { try Engine.airportNotamsNone(private: place.isPrivate, military: place.military, notamId: place.notamId) }
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
