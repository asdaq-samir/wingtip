import AppIntents
import Foundation

/// An airplane as Siri takes one -- "fly N123AB", "this airplane" -- by
/// its N-number, from the pilot's own airplanes (Airplanes' records) and
/// the one the route flies. The N-number is the id: any tail said is one,
/// and flying it takes the pilot's record's figures, or the registry's
/// type's, as the Airplane tab does (Plan.fly). Never one assumed.
struct AirplaneEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Airplane"
    static let defaultQuery = AirplaneEntityQuery()

    let id: String
    let type: String

    init(tail: String, type: String = "") {
        id = tail.uppercased()
        self.type = type
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(id)", subtitle: type.isEmpty ? nil : "\(type)", image: .init(systemName: "airplane"))
    }
}

struct AirplaneEntityQuery: EntityStringQuery {
    /// The airplane the route flies, then the pilot's own, each once.
    func suggestedEntities() async throws -> [AirplaneEntity] {
        await MainActor.run {
            var out: [AirplaneEntity] = []
            if let tail = ReadyToFly.shared.plan?.tail { out.append(AirplaneEntity(tail: tail, type: Airplanes.shared.record(tail)?.typeDesignator ?? "")) }
            for record in Airplanes.shared.records where !out.contains(where: { $0.id == record.tailNumber.uppercased() }) {
                out.append(AirplaneEntity(tail: record.tailNumber, type: record.typeDesignator))
            }
            return out
        }
    }

    func entities(for identifiers: [String]) async throws -> [AirplaneEntity] {
        let known = try await suggestedEntities()
        return identifiers.map { id in known.first { $0.id == id.uppercased() } ?? AirplaneEntity(tail: id) }
    }

    /// An N-number said: "November one two three alpha bravo" comes from
    /// Siri as "N123AB"; one of the pilot's first, else the tail as said.
    func entities(matching string: String) async throws -> [AirplaneEntity] {
        let said = string.uppercased().filter { $0.isLetter || $0.isNumber }
        guard !said.isEmpty else { return [] }
        let known = try await suggestedEntities().filter { $0.id.contains(said) || $0.type.uppercased() == said }
        if !known.isEmpty { return known }
        return said.hasPrefix("N") && said.count >= 2 && said.count <= 6 ? [AirplaneEntity(tail: said)] : []
    }
}

/// "Fly N123AB" to Siri: the route planned with that airplane, its figures
/// the pilot's record's or the registry type's (Plan.fly), as picking it
/// on the Airplane tab does.
struct FlyAirplaneIntent: CommandIntent {
    static let title: LocalizedStringResource = "Fly an Airplane"
    static let description = IntentDescription("Plans your route with an airplane, by its N-number.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Airplane", requestValueDialog: "Which airplane?")
    var airplane: AirplaneEntity

    static var parameterSummary: some ParameterSummary { Summary("Fly \(\.$airplane)") }

    func appCommand() -> AppCommand? { .fly(tail: airplane.id) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let tail = airplane.id
        return .result(dialog: IntentDialog(full: "Planning with \(tail).", supporting: "\(tail)"))
    }
}

/// A logbook entry as Siri takes one -- "open this entry" -- from the
/// pilot's logbook on the gateway, by its id.
struct LogbookEntryEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Logbook Entry"
    static let defaultQuery = LogbookEntryEntityQuery()

    let id: Int
    let flownOn: String
    let route: String
    let hours: Double

    init(_ entry: LogbookEntry) {
        id = entry.id
        flownOn = entry.flownOn
        route = entry.route ?? ""
        hours = entry.totalHours
    }

    var displayRepresentation: DisplayRepresentation {
        let title = route.isEmpty ? flownOn : "\(flownOn) \(route)"
        return DisplayRepresentation(title: "\(title)", subtitle: "\(Format.number(hours, decimals: 1)) hours", image: .init(systemName: "book.closed"))
    }
}

struct LogbookEntryEntityQuery: EntityQuery {
    /// The latest entries, signed in; none signed out.
    func suggestedEntities() async throws -> [LogbookEntryEntity] {
        ((try? await Gateway.logbook()) ?? []).prefix(10).map(LogbookEntryEntity.init)
    }

    func entities(for identifiers: [Int]) async throws -> [LogbookEntryEntity] {
        let all = (try? await Gateway.logbook()) ?? []
        return identifiers.compactMap { id in all.first { $0.id == id }.map(LogbookEntryEntity.init) }
    }
}

/// An entry opened from Siri or Spotlight: the logbook, where it is.
struct OpenLogbookEntryIntent: OpenIntent, CommandIntent {
    static let title: LocalizedStringResource = "Open a Logbook Entry"
    static let description = IntentDescription("Opens your logbook.")

    @Parameter(title: "Entry")
    var target: LogbookEntryEntity

    func appCommand() -> AppCommand? { .open(.logbook) }

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
