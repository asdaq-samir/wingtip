import AppIntents
import Foundation

/// A field's frequency as Siri takes one -- "what's the tower here",
/// "that frequency" -- from the card it is shown on. The id carries the
/// field, NASR's code, the megahertz and its words ("KMSN|TWR|119.3|
/// MADISON TWR"), so a kept one is said again with no planner.
struct FrequencyEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Frequency"
    static let defaultQuery = FrequencyEntityQuery()

    let id: String

    init(id: String) { self.id = id }

    init(field: String, _ frequency: Frequency) {
        let mhz = frequency.frequencyMhz.map { AirportWords.mhz($0) } ?? ""
        id = [field.uppercased(), frequency.type ?? "", mhz, frequency.description ?? ""].joined(separator: "|")
    }

    private var parts: [String] { id.split(separator: "|", omittingEmptySubsequences: false).map(String.init) }
    var field: String { parts[safe: 0] ?? "" }
    var mhz: String { parts[safe: 2] ?? "" }

    /// The frequency as the card names it ("Tower"), from NASR's code and words.
    var name: String { AirportWords.frequencyLine(type: parts[safe: 1], description: parts[safe: 3]).name }

    /// As a pilot says it: "Madison Tower, 119.3".
    var spoken: String { mhz.isEmpty ? "\(field) \(name)" : "\(field) \(name), \(mhz)" }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(field) \(name)", subtitle: "\(mhz)", image: .init(systemName: "antenna.radiowaves.left.and.right"))
    }
}

struct FrequencyEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FrequencyEntity] {
        identifiers.map(FrequencyEntity.init(id:))
    }
}

/// A NOTAM as Siri takes one -- "what does this NOTAM mean for me" --
/// from the ranked list for the route (ReadyToFly's NOTAMs, the engine's
/// notams_ranked), by its FAA id.
struct NotamEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "NOTAM"
    static let defaultQuery = NotamEntityQuery()

    let id: String
    let field: String
    let raw: String

    init(id: String, field: String, raw: String) {
        self.id = id
        self.field = field
        self.raw = raw
    }

    init(_ notam: APIRankedNotam) {
        self.init(id: notam.id, field: notam.field ?? "", raw: notam.raw)
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "NOTAM \(id)", subtitle: "\(field.isEmpty ? String(raw.prefix(60)) : field)", image: .init(systemName: "exclamationmark.bubble"))
    }
}

struct NotamEntityQuery: EntityQuery {
    /// The route's ranked NOTAMs the phone holds, the most important first.
    @MainActor
    static func held() -> [APIRankedNotam] {
        (ReadyToFly.shared.notams?.notams ?? []).sorted { $0.rank < $1.rank }
    }

    func suggestedEntities() async throws -> [NotamEntity] {
        await MainActor.run { Self.held().prefix(10).map(NotamEntity.init) }
    }

    func entities(for identifiers: [String]) async throws -> [NotamEntity] {
        let held = await MainActor.run { Self.held() }
        return identifiers.compactMap { id in held.first { $0.id == id }.map(NotamEntity.init) }
    }
}

/// An approach as Siri takes one -- "brief the ILS 27 at Madison", "brief
/// this approach" -- from the field's procedures (the planner's CIFP). The
/// id is the field and the procedure's own id, with its name after, so a
/// kept one is briefed again with nothing else to look up.
struct ApproachEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Approach"
    static let defaultQuery = ApproachEntityQuery()

    let id: String

    init(id: String) { self.id = id }

    init(pick: ProcedurePick) {
        id = "\(pick.ident.uppercased())|\(pick.id)|\(pick.name)"
    }

    init(field: String, _ procedure: ProcedureSummary) {
        id = "\(field.uppercased())|\(procedure.id)|\(procedure.name)"
    }

    private var parts: [String] { id.split(separator: "|", omittingEmptySubsequences: false).map(String.init) }
    var field: String { parts[safe: 0] ?? "" }
    var procedure: String { parts[safe: 1] ?? "" }
    var name: String { parts[safe: 2] ?? procedure }

    /// The approach as the route takes it (Plan.pick).
    var pick: ProcedurePick { ProcedurePick(ident: field, id: procedure, kind: "approach", name: name, transition: nil) }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(field)", image: .init(systemName: "airplane.arrival"))
    }
}

struct ApproachEntityQuery: EntityStringQuery {
    /// The approaches at the route's destination and stops, where the
    /// route holds a field.
    func suggestedEntities() async throws -> [ApproachEntity] {
        let fields = await MainActor.run { () -> [String] in
            guard let plan = ReadyToFly.shared.plan, plan.routed else { return [] }
            return [plan.dest] + plan.stops
        }
        var out: [ApproachEntity] = []
        for field in fields.prefix(2) { out += (try? await Self.approaches(at: field)) ?? [] }
        return out
    }

    func entities(for identifiers: [String]) async throws -> [ApproachEntity] {
        identifiers.map(ApproachEntity.init(id:))
    }

    /// "ILS 27 at Madison", "RNAV 36 KMSN": the field after "at" (or an
    /// ident said), found as the microphone finds one, then its approaches
    /// whose name holds every other word said.
    func entities(matching string: String) async throws -> [ApproachEntity] {
        let (words, place) = Self.split(string)
        var field: String?
        if let place { field = try await IntentLookups.field(for: place) }
        if field == nil {
            field = await MainActor.run { ReadyToFly.shared.plan.flatMap { $0.routed ? $0.dest : nil } }
        }
        guard let field else { return [] }
        let all = try await Self.approaches(at: field)
        return all.filter { Self.matches($0.name, words) }
    }

    static func approaches(at field: String) async throws -> [ApproachEntity] {
        try await Planner.procedures(field).procedures.filter { $0.kind == "approach" }.map { ApproachEntity(field: field, $0) }
    }

    /// The words said split into the approach's own and the field's:
    /// "ILS 27 at Madison" is (["ILS", "27"], "Madison"); a last word
    /// that reads as an ident is the field.
    static func split(_ said: String) -> (words: [String], place: String?) {
        let text = said.trimmingCharacters(in: .whitespacesAndNewlines)
        if let at = text.range(of: " at ", options: .caseInsensitive) {
            return (text[..<at.lowerBound].split(separator: " ").map(String.init), String(text[at.upperBound...]))
        }
        var words = text.split(separator: " ").map(String.init)
        if let last = words.last, last.count == 4, IntentLookups.looksLikeIdent(last), last.contains(where: \.isLetter) {
            words.removeLast()
            return (words, last)
        }
        return (words, nil)
    }

    /// Whether every word said is in the approach's name, as a pilot says
    /// it: "runway" and "approach" left out, "two seven" heard as figures.
    static func matches(_ name: String, _ words: [String]) -> Bool {
        let named = name.uppercased().replacingOccurrences(of: "RWY", with: " ").split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "(" || $0 == ")" })
        let skip: Set<String> = ["RUNWAY", "RWY", "APPROACH", "THE"]
        return words.map { $0.uppercased() }.filter { !skip.contains($0) }.allSatisfy { word in
            named.contains { $0 == word || ($0.hasPrefix(word) && word.count >= 2) }
        }
    }
}
