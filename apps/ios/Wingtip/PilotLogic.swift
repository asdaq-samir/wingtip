import Foundation

/// An airplane's checklist as the pilot writes it in plain text (the
/// engine's `checklist_read` and `checklist_write`, the web app's
/// lib/checklist): a line starting "#" a section, every other line an
/// item, its challenge and its response split by a dash or a run of dots,
/// as a printed checklist sets them ("Fuel selector -- Both", "Mixture
/// ..... Rich"). An item before any section is in "Checklist". The limits
/// are the gateway's: 40 characters a title, 80 a challenge or a
/// response. The app writes none of its own: the flight manual's is the
/// airplane's.
enum ChecklistText {
    /// Thrown where the engine cannot answer, which the checklist's screen
    /// says (ChecklistModel.problem).
    static func parse(_ text: String) throws -> Checklist {
        Checklist(try Engine.checklistRead(text: text))
    }

    static func text(of checklist: Checklist) throws -> String {
        try Engine.checklistWrite(checklist: checklist)
    }
}

/// The logbook as a CSV file, out and in (the engine's
/// `logbook_csv_write` and `logbook_csv_read`, the web app's
/// lib/logbookCsv): out in ForeFlight's column names where it has the
/// field; in from that file again or from ForeFlight's own export -- an
/// Aircraft Table, then a Flights Table, each a row of field names
/// (ForeFlight Logbook Guide v14.0, "ForeFlight Template"), its names read
/// whatever their spaces or case. All its landings count as day landings
/// for 61.57(a), the night full-stop ones apart (61.57(b)). The entries
/// are the gateway's, camel case, as the engine reads and writes them.
enum LogbookCSV {
    /// RFC 4180's rows of fields (the engine's `csv_rows`).
    static func rows(_ text: String) throws -> [[String]] {
        try Engine.csvRows(text: text)
    }

    /// The logbook as a CSV file, oldest flight first; thrown where the
    /// engine cannot write it. The contract takes each entry as the
    /// gateway's JSON object, which the record is.
    static func csv(_ entries: [LogbookEntry]) throws -> String {
        try Engine.logbookCsvWrite(entries: entries.map { try Engine.recoded($0) })
    }

    typealias Skipped = EngineContract.LogbookCsvReadAnswerSkippedItem
    struct Imported: Equatable { var entries: [LogbookEntryRequest]; var skipped: [Skipped] }

    /// A logbook CSV read: ForeFlight's, or this logbook's own; thrown
    /// where the engine cannot read it, which the logbook says.
    static func read(_ text: String) throws -> Imported {
        let read = try Engine.logbookCsvRead(text: text)
        // The engine's entries are the gateway's LogbookEntryRequest by
        // name, so each is read again as the request sent.
        return Imported(entries: try read.entries.map { try Engine.recoded($0) }, skipped: read.skipped)
    }

    /// What an import brought in, in a line.
    static func summary(_ read: Imported, _ result: LogbookImportResult) -> String {
        var parts = ["\(result.added) flight\(result.added == 1 ? "" : "s") added"]
        if result.duplicates > 0 { parts.append("\(result.duplicates) already in your logbook") }
        if !read.skipped.isEmpty {
            let some = read.skipped.prefix(3).map { "line \($0.line): \($0.reason)" }.joined(separator: "; ")
            parts.append("\(read.skipped.count) row\(read.skipped.count == 1 ? "" : "s") left out (\(some)\(read.skipped.count > 3 ? "; …" : ""))")
        }
        return parts.joined(separator: ", ") + "."
    }
}

/// Endorsements as AC 61-65K has them signed (the web app's
/// lib/endorsements and lib/checkride): the gateway's template with its
/// blanks filled, and the signature line every endorsement carries.
enum Endorsing {
    /// The template's {blanks} filled: {student} with the name as on the
    /// student's certificate, the rest from the form; runs of space made
    /// one (the engine's `endorsement_render`); thrown where it cannot, and
    /// nothing is signed then.
    static func render(_ template: String, student: String, fields: [String: String]) throws -> String {
        try Engine.endorsementRender(template: template, student: student, fields: fields)
    }

    /// "/s/ 10-13-2026 J. J. Jones 987654321CFI RE 12-31-2027": the date,
    /// name, certificate number and its end, as AC 61-65K asks.
    static func signatureLine(_ instructor: Instructor, signedOn: String) -> String {
        let kind = instructor.untilKind == "EXP" ? "Exp." : "RE"
        return "/s/ \(Day.acDay(signedOn)) \(instructor.fullName ?? "") \(instructor.certificate ?? "") \(kind) \(Day.acDay(instructor.until ?? ""))"
    }

    /// The warning above "Sign as" once the instructor's date has passed
    /// on the day of signing, or nil; the engine's `endorsement_lapse`,
    /// the web's lib/endorsements lapseWarning word for word. Never a
    /// block: the owner's rule is to make the pilot aware, not restrict
    /// them (2026-10-26), and the gateway signs either way. A certificate
    /// issued on or after 1 Dec 2024 has no expiration date (14 CFR
    /// 61.19(d)(1)) and its date is the end of the recent experience
    /// 61.197(a) asks for in the preceding 24 calendar months; an older
    /// one expires 24 calendar months from issue, renewal or reinstatement
    /// (61.19(d)(2)), and its privileges then wait for reinstatement under
    /// 61.199 (61.197(e)).
    /// Thrown where the engine cannot say, which the signing screen shows.
    static func lapseWarning(_ instructor: Instructor, signedOn: String) throws -> String? {
        try Engine.endorsementLapse(until: instructor.until, untilKind: instructor.untilKind, signedOn: signedOn)
    }

    /// The latest of each kind signed in the app and not voided; the
    /// record comes newest first (the engine's `endorsements_in_force`,
    /// which answers each code with its index into the record, a pair the
    /// contract leaves untyped).
    static func inForce(_ signed: [SignedEndorsement]) throws -> [String: SignedEndorsement] {
        let pairs = try Engine.endorsementsInForce(signed: signed.map { .init(code: $0.code, voided: $0.voided) })
        var out: [String: SignedEndorsement] = [:]
        for pair in pairs {
            guard pair.count == 2, let code = pair[0].value as? String, let at = pair[1].number,
                  signed.indices.contains(Int(at)) else { continue }
            out[code] = signed[Int(at)]
        }
        return out
    }

    /// A solo cross-country's airports in order: "KUGN KRFD KUGN".
    static func route(_ r: CrossCountryReview) -> String {
        let f = r.flight
        return ([f.departureIdent] + f.stops + [f.destinationIdent]).joined(separator: " ")
    }

    /// Where a solo cross-country put to an instructor stands.
    static func state(_ r: CrossCountryReview) -> String {
        if let e = r.endorsement { return "Endorsed \(Day.said(e.signedOn))" }
        if r.answeredAt != nil { return "Not endorsed: \(r.declinedNote ?? "")" }
        return "Waiting for your instructor"
    }

    /// One of 61.93(d)'s determinations: the rule and what it asks.
    typealias Determination = EngineContract.SoloXcDeterminationsAnswerItem

    /// 14 CFR 61.93(d)(1)-(3): what an instructor must determine of a solo
    /// cross-country themselves before endorsing it, the engine's
    /// (`solo_xc_determinations`); (4) and (5), the student's
    /// endorsements, the record answers. Asked once; a refusal is said on
    /// the signing screen, which then signs no cross-country.
    static let determinations = Result { try Engine.soloXcDeterminations() }

    /// The airports' blanks of a solo cross-country's endorsement, filled
    /// from the flight put to the instructor, as the web app fills them.
    static func reviewFields(_ r: CrossCountryReview) -> [String: String] {
        let f = r.flight
        return [
            "from": f.departureIdent, "to": f.destinationIdent, "via": f.stops.isEmpty ? "direct" : f.stops.joined(separator: ", "),
            "landings": (f.stops + [f.destinationIdent]).joined(separator: ", "), "mm": r.makeModel, "date": Day.acDay(r.flightOn),
        ]
    }

    /// The ACS codes in what was pasted -- a report's text, a list, codes in
    /// lower case -- each once, in the order given; a sub-element's letter
    /// lower case, as the ACS writes it (K1a). The engine's `acs_codes`.
    static func acsCodes(in text: String) throws -> [String] {
        try Engine.acsCodes(text: text)
    }
}

/// The FAA's own words for each ACS code (FAA-S-ACS-6C, -8C), the web
/// app's lib/acs.json, kept in the app's bundle.
struct AcsTable: Decodable, Sendable {
    struct TaskWords: Decodable, Sendable { let area: String; let task: String }
    let editions: [String]
    let tasks: [String: TaskWords]
    let elements: [String: String]

    static let bundled: AcsTable? = {
        guard let url = Bundle.main.url(forResource: "acs", withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(AcsTable.self, from: data)
    }()

    /// A code's task and element in the ACS's words; nil for a code this
    /// edition does not have.
    func words(_ code: String) -> String? {
        guard let task = tasks[code.split(separator: ".").prefix(3).joined(separator: ".")] else { return nil }
        return elements[code].map { "\(task.task): \($0)" } ?? task.task
    }
}

/// The airplane form's fields as typed, checked by the engine as the
/// gateway checks them (AircraftRequest's @NotBlank/@Positive, the web
/// app's form) before the round trip.
struct AircraftForm: Equatable {
    var tailNumber = ""
    var typeDesignator = ""
    var cruiseTasKt = ""
    var fuelBurnGph = ""
    var cruisePowerPct = ""
    var climbTasKt = ""
    var climbFuelBurnGph = ""
    var descentIasKt = ""
    var descentFuelBurnGph = ""
    var usableFuelGal = ""
    var equipment = ""
    var surveillance = ""
    var colour = ""

    init() {}

    init(_ a: OwnAircraftRecord) {
        func s(_ v: Double?) -> String { v.map { $0 == $0.rounded() ? String(Int($0)) : String($0) } ?? "" }
        tailNumber = a.tailNumber; typeDesignator = a.typeDesignator
        cruiseTasKt = s(a.cruiseTasKt); fuelBurnGph = s(a.fuelBurnGph); cruisePowerPct = s(a.cruisePowerPct)
        climbTasKt = s(a.climbTasKt); climbFuelBurnGph = s(a.climbFuelBurnGph); usableFuelGal = s(a.usableFuelGal)
        descentIasKt = s(a.descentIasKt); descentFuelBurnGph = s(a.descentFuelBurnGph)
        equipment = a.equipment ?? ""; surveillance = a.surveillance ?? ""; colour = a.colour ?? ""
    }

    private static func number(_ s: String) -> Double? { Double(s.trimmingCharacters(in: .whitespaces)) }

    /// The key of a problem with the form as a whole, said under it: the
    /// engine could not check the fields, so nothing may be saved.
    static let formKey = "form"

    /// What is wrong, by field, in the web app's words; empty when it may
    /// be saved. The limits are the engine's (`aircraft_problems`), the
    /// gateway's and the web's own; where the engine cannot answer, the
    /// form says so rather than pass unchecked figures.
    var problems: [String: String] {
        let answer: EngineContract.AircraftProblemsAnswer
        do {
            answer = try Engine.aircraftProblems(
                tailNumber: tailNumber, typeDesignator: typeDesignator, cruiseTasKt: cruiseTasKt, fuelBurnGph: fuelBurnGph,
                cruisePowerPct: cruisePowerPct, climbTasKt: climbTasKt, climbFuelBurnGph: climbFuelBurnGph,
                descentIasKt: descentIasKt, descentFuelBurnGph: descentFuelBurnGph, usableFuelGal: usableFuelGal, equipment: equipment, surveillance: surveillance, colour: colour)
        } catch {
            Log.engine.error("aircraft_problems: \(error.localizedDescription, privacy: .public)")
            return [Self.formKey: "The figures could not be checked: \(error.localizedDescription)"]
        }
        let byField: [String: String?] = [
            "tailNumber": answer.tailNumber, "typeDesignator": answer.typeDesignator, "cruiseTasKt": answer.cruiseTasKt,
            "fuelBurnGph": answer.fuelBurnGph, "cruisePowerPct": answer.cruisePowerPct, "climbTasKt": answer.climbTasKt,
            "climbFuelBurnGph": answer.climbFuelBurnGph, "descentIasKt": answer.descentIasKt,
            "descentFuelBurnGph": answer.descentFuelBurnGph, "usableFuelGal": answer.usableFuelGal, "equipment": answer.equipment,
            "surveillance": answer.surveillance, "colour": answer.colour,
        ]
        return byField.compactMapValues { $0 }
    }

    /// The request, when there is nothing wrong.
    var request: AircraftRequest? {
        guard problems.isEmpty, let tas = Self.number(cruiseTasKt), let burn = Self.number(fuelBurnGph) else { return nil }
        func opt(_ s: String) -> Double? { Self.number(s) }
        func words(_ s: String) -> String? { let t = s.trimmingCharacters(in: .whitespaces); return t.isEmpty ? nil : t }
        return AircraftRequest(
            climbFuelBurnGph: opt(climbFuelBurnGph),
            climbTasKt: opt(climbTasKt),
            colour: words(colour),
            cruisePowerPct: opt(cruisePowerPct),
            cruiseTasKt: tas,
            descentFuelBurnGph: opt(descentFuelBurnGph),
            descentIasKt: opt(descentIasKt),
            equipment: words(equipment)?.uppercased(),
            fuelBurnGph: burn,
            surveillance: words(surveillance)?.uppercased(),
            tailNumber: tailNumber.trimmingCharacters(in: .whitespaces).uppercased(),
            typeDesignator: typeDesignator.trimmingCharacters(in: .whitespaces).uppercased(),
            usableFuelGal: opt(usableFuelGal))
    }
}

/// Flash-card drills (the web app's lib/drills, kept the same): the
/// tower's light signals (14 CFR 91.125) and the basic VFR weather
/// minimums (91.155), each worded as the regulation words it by the
/// engine (`drill_decks`), gone
/// through by Leitner's boxes -- a card known moves up a box and comes
/// back later, a card missed goes back to the first. Kept on this device.
enum Drills {
    enum Light: String, Sendable, Decodable { case green, red, white }

    /// The engine's card (EngineContract.DrillCard) with its lamp's colours
    /// as the app draws them.
    struct Card: Equatable, Sendable, Identifiable, Decodable {
        let id: String
        let prompt: String
        let answer: String
        var detail: String?
        var colours: [Light] = []
        var flashing = false
    }

    struct Deck: Sendable, Decodable {
        let key: String
        let title: String
        let source: String
        let url: URL
        let cards: [Card]
    }

    /// Both decks, the engine's (`drill_decks`): 14 CFR 91.125's table and
    /// 91.155(a)'s, worded there once from the rules the airspace column
    /// gives each band. Asked once; a refusal is said where the drills are
    /// listed (PilotGuideView), and each deck is then empty.
    static let decks = Result {
        try Engine.drillDecks().map { d in
            Deck(key: d.key, title: d.title, source: d.source, url: URL(string: d.url) ?? URL(string: "https://www.ecfr.gov")!,
                 cards: d.cards.map {
                     Card(id: $0.id, prompt: $0.prompt, answer: $0.answer, detail: $0.detail,
                          colours: $0.colours.compactMap(Light.init(rawValue:)), flashing: $0.flashing)
                 })
        }
    }

    private static func deck(_ key: String) -> Deck {
        ((try? decks.get()) ?? []).first { $0.key == key }
            ?? Deck(key: key, title: "", source: "", url: URL(string: "https://www.ecfr.gov")!, cards: [])
    }

    static var lightGun: Deck { deck("light-gun") }
    static var vfrMinimums: Deck { deck("vfr-minimums") }

    static let day: TimeInterval = 86_400

    struct Standing: Codable, Equatable, Sendable { var box: Int; var due: Date }
    typealias Progress = [String: Standing]

    /// A card answered: its new box and the days until it comes round
    /// again are the engine's (`drill_next`, Leitner's boxes). Where the
    /// engine cannot answer, the progress is kept as it was, so the card
    /// stays due and comes up again, and the refusal is logged.
    static func answered(_ progress: Progress, card: String, knew: Bool, now: Date) -> Progress {
        let next: EngineContract.DrillNextAnswer
        do {
            next = try Engine.drillNext(box: progress[card].map { Double($0.box) }, knew: knew)
        } catch {
            Log.engine.error("drill_next: \(error.localizedDescription, privacy: .public)")
            return progress
        }
        var out = progress
        out[card] = Standing(box: Int(next.box), due: now.addingTimeInterval(next.inDays * day))
        return out
    }

    /// The cards due now -- never seen, or past their day -- the lowest
    /// box first, in the deck's order within a box.
    static func due(_ deck: Deck, _ progress: Progress, now: Date) -> [Card] {
        let at = { (c: Card) in progress[c.id] ?? Standing(box: 0, due: .distantPast) }
        return deck.cards.enumerated()
            .filter { at($0.element).due <= now }
            .sorted { (at($0.element).box, $0.offset) < (at($1.element).box, $1.offset) }
            .map(\.element)
    }

    static func nextDue(_ deck: Deck, _ progress: Progress, now: Date) -> Date? {
        deck.cards.compactMap { progress[$0.id]?.due }.filter { $0 > now }.min()
    }

    private static func key(_ deck: Deck) -> String { "drill.\(deck.key)" }

    static func kept(_ deck: Deck) -> Progress {
        UserDefaults.standard.decoded(Progress.self, forKey: key(deck)) ?? [:]
    }

    static func keep(_ progress: Progress, for deck: Deck) {
        UserDefaults.standard.setEncoded(progress, forKey: key(deck))
    }
}

/// Two-way radio failure under IFR, the parts that are the rule's words
/// (14 CFR 91.185): the route in the rule's order, VFR's words and when to
/// leave the clearance limit, each the engine's (lost_comms), the web's
/// and the planner's own; the altitude on each segment the engine's too
/// (LostCommsSegmentsSections).
enum LostComms {
    /// The engine's answer with no segments: its words alone; thrown where
    /// it cannot answer, which the page says (LostCommsView).
    static func words(approachFix: Bool = false, efc: String = "", eta: String = "") throws -> LostCommsAnswer {
        try Engine.lostComms(segments: [], expectedFrom: 0, approachFix: approachFix, efc: efc, eta: eta)
    }

    /// The rule's words as the page opens: 91.185(c)(1)'s routes in the
    /// rule's order (the first that applies), (b)'s VFR words and (c)(2)'s
    /// altitude rule.
    static let opening = Result { try words() }

    /// 91.185(c)(3): when to leave the clearance limit, in words.
    static func leaveLimit(approachFix: Bool, efc: String, eta: String) throws -> String {
        try words(approachFix: approachFix, efc: efc, eta: eta).leave
    }
}
