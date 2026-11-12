import AppIntents
import Foundation

/// A point of the route as Siri takes one -- "fly direct to that
/// waypoint", "what's this checkpoint" -- the route's fields and fixes by
/// their idents, and the chart's checkpoints by their names. The id says
/// what the point is, so Siri's and Shortcuts' kept ones are found again
/// with no planner: a field or fix is its ident ("KMSN", "GOPHER"); a
/// checkpoint is "cp:" with its name and position ("cp:Lake Mendota@43.10,-89.42").
struct WaypointEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Waypoint"
    static let defaultQuery = WaypointEntityQuery()

    let id: String
    let name: String
    /// What it is on the route: "Departure", "Stop", "Destination", "Checkpoint 3".
    let role: String

    /// The ident Direct To takes, where the point has one; a checkpoint
    /// drawn from the chart (a lake, a town) has none.
    var ident: String? { id.hasPrefix(Self.checkpointPrefix) ? nil : id }

    static let checkpointPrefix = "cp:"

    init(id: String, name: String, role: String) {
        self.id = id
        self.name = name
        self.role = role
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(ident ?? name)", subtitle: "\(role)", image: .init(systemName: ident == nil ? "mappin" : "smallcircle.filled.circle"),
                              synonyms: name.isEmpty ? [] : ["\(name)"])
    }

    /// The points of a route, in order: its fields, then its checkpoints.
    @MainActor
    static func points(of plan: Plan) -> [WaypointEntity] {
        guard plan.routed else { return [] }
        var points = [WaypointEntity(id: plan.dep, name: plan.course?.departure.name ?? "", role: "Departure")]
        for (i, stop) in plan.stops.enumerated() {
            points.append(WaypointEntity(id: stop, name: plan.course?.stops?[safe: i]?.name ?? "", role: "Stop"))
        }
        points.append(WaypointEntity(id: plan.dest, name: plan.course?.destination.name ?? "", role: "Destination"))
        for (i, point) in plan.checkpoints.enumerated() {
            points.append(checkpoint(point, number: i + 1))
        }
        return points
    }

    /// A checkpoint as Siri names it: by its fix where it is one, else by
    /// its name and where it is.
    static func checkpoint(_ point: Checkpoint, number: Int) -> WaypointEntity {
        let name = point.name ?? point.waypoint ?? point.category
        if let fix = point.waypoint, !fix.isEmpty {
            return WaypointEntity(id: fix.uppercased(), name: name, role: "Checkpoint \(number)")
        }
        let id = "\(checkpointPrefix)\(name)@\(String(format: "%.4f,%.4f", point.lat, point.lon))"
        return WaypointEntity(id: id, name: name, role: "Checkpoint \(number)")
    }
}

struct WaypointEntityQuery: EntityQuery {
    /// The route's points, on the phone, with no signal.
    func suggestedEntities() async throws -> [WaypointEntity] {
        await MainActor.run { ReadyToFly.shared.plan.map(WaypointEntity.points(of:)) ?? [] }
    }

    func entities(for identifiers: [String]) async throws -> [WaypointEntity] {
        let route = try await suggestedEntities()
        return identifiers.map { id in
            route.first { $0.id == id } ?? WaypointEntity(id: id, name: Self.name(of: id), role: "Waypoint")
        }
    }

    /// A kept id's name: a checkpoint's from the id, a fix's its ident.
    static func name(of id: String) -> String {
        guard id.hasPrefix(WaypointEntity.checkpointPrefix) else { return id }
        return String(id.dropFirst(WaypointEntity.checkpointPrefix.count).split(separator: "@").first ?? "")
    }
}

/// A flight as Siri takes one -- "plan this flight", "brief my flight" --
/// its route written as pilots write one, "C81 KOSH KDLH", which is also
/// its id, so a kept one is planned again with nothing else to look up.
struct FlightEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Flight"
    static let defaultQuery = FlightEntityQuery()

    let id: String

    var fields: [String] { id.split(separator: " ").map(String.init) }

    init(dep: String, stops: [String], dest: String) {
        id = ([dep] + stops + [dest]).map { $0.uppercased() }.joined(separator: " ")
    }

    init(id: String) { self.id = id.uppercased() }

    /// What planning it again asks of the app; nil for fewer than two fields.
    var command: AppCommand? {
        let f = fields
        guard f.count >= 2, let dep = f.first, let dest = f.last else { return nil }
        return .planRoute(dep: dep, stops: Array(f.dropFirst().dropLast()), dest: dest)
    }

    var displayRepresentation: DisplayRepresentation {
        let f = fields
        let title = f.count >= 2 ? "\(f.first ?? "") to \(f.last ?? "")" : id
        return DisplayRepresentation(title: "\(title)", subtitle: "\(id)", image: .init(systemName: "airplane.departure"))
    }
}

struct FlightEntityQuery: EntityQuery {
    /// The route on the screen, and the one kept on the phone, each once.
    func suggestedEntities() async throws -> [FlightEntity] {
        let live = await MainActor.run { () -> FlightEntity? in
            guard let plan = ReadyToFly.shared.plan, plan.routed else { return nil }
            return FlightEntity(dep: plan.dep, stops: plan.stops, dest: plan.dest)
        }
        let kept = Kept.load().map { FlightEntity(dep: $0.dep, stops: $0.stops, dest: $0.dest) }
        var out: [FlightEntity] = []
        for flight in [live, kept].compactMap({ $0 }) where !out.contains(where: { $0.id == flight.id }) { out.append(flight) }
        return out
    }

    func entities(for identifiers: [String]) async throws -> [FlightEntity] {
        identifiers.map(FlightEntity.init(id:))
    }
}

/// A flight opened from Siri, Spotlight or a Shortcut: its route planned
/// again in the app, as a shared link plans one.
struct OpenFlightIntent: OpenIntent, CommandIntent {
    static let title: LocalizedStringResource = "Open a Flight"
    static let description = IntentDescription("Plans a flight's route again in the app.")

    @Parameter(title: "Flight")
    var target: FlightEntity

    func appCommand() -> AppCommand? { target.command }

    func perform() async throws -> some IntentResult {
        return .result()
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
