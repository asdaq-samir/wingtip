import Foundation
import Observation

/// The route's fields' cards, each asked once while FPL shows the route
/// and shared by its timeline's lines (the web's RouteTimeline asks each
/// field's airportQuery the same way): whether NASR lists it closed (the
/// planner's label from the engine's field_status, decision 0043), its
/// latest report's flight category, its runways and its time zone. Kept on
/// this iPhone with the air's answers (KeptForAir), so a field kept for
/// the flight still says itself with no signal. Until a field's card is in
/// it is not known to be open, and its line offers nothing to land by.
/// With them, each field's procedures (which kinds it has, for its "+ APCH"
/// and the rest) and each procedure picked as the planner draws it (its
/// fixes, for their rows on the route's line).
@MainActor
@Observable
final class RouteFieldCards {
    private(set) var places: [String: AirportPlace] = [:]
    /// Why a field's card could not be had, said in its line in red: with
    /// no card, whether it is open is not known.
    private(set) var failed: [String: String] = [:]
    /// Each field's procedures, by its ident.
    private(set) var procedures: [String: ProcedureList] = [:]
    /// Each procedure picked as the planner draws it, by `drawingKey`.
    private(set) var drawings: [String: ProcedureDrawing] = [:]
    @ObservationIgnored private var asking: Set<String> = []

    /// A pick's drawing's key: its field, procedure and transition.
    static func drawingKey(_ pick: ProcedurePick) -> String {
        "\(pick.ident.uppercased()):\(pick.id):\(pick.transition ?? "")"
    }

    /// The procedure picked as drawn, where it is in.
    func drawing(_ pick: ProcedurePick) -> ProcedureDrawing? { drawings[Self.drawingKey(pick)] }

    /// Whether the field publishes a procedure of `kind`.
    func has(_ kind: String, at ident: String) -> Bool {
        procedures[ident.uppercased()]?.procedures.contains { $0.kind == kind } ?? false
    }

    func place(_ ident: String) -> AirportPlace? { places[ident.uppercased()] }

    /// Each field's own time zone by its ident, from its card's time_zone.
    var zones: [String: TimeZone] { places.compactMapValues { $0.timeZone.flatMap(TimeZone.init(identifier:)) } }

    /// Whether the field's card has said whether it is open.
    func known(_ ident: String) -> Bool { places[ident.uppercased()] != nil }

    /// What keeps a field from being landed at, in its line: closed, with
    /// what to do, or its card not had; nil while it is open or asked.
    func problem(_ ident: String) -> String? {
        let key = ident.uppercased()
        if let closed = places[key]?.closed, !closed.isEmpty { return "\(closed). Pick another field." }
        return failed[key]
    }

    /// Each of `fields` asked for that is not in yet, one after another
    /// so the first lines fill first; a field asked already is not asked
    /// again while this page is.
    func load(_ fields: [String]) async {
        for ident in fields.map({ $0.uppercased() }) where places[ident] == nil && !asking.contains(ident) {
            asking.insert(ident)
            defer { asking.remove(ident) }
            do {
                let place = try await KeptForAir.answer(.airports, key: ident) { try await Planner.place(ident) }.value
                guard !Task.isCancelled else { return }
                places[ident] = place
                failed[ident] = nil
                // Its procedures with it, for the kinds it has; none said
                // where they could not be had (the kinds are then left out).
                if procedures[ident] == nil, let list = try? await Planner.procedures(ident), !Task.isCancelled {
                    procedures[ident] = list
                }
            } catch {
                guard !Task.isCancelled, !(error is CancellationError) else { return }
                failed[ident] = Self.failedWords(ident, error)
            }
        }
    }

    /// The procedures picked, each as the planner draws it, those not in
    /// yet asked for; one that could not be had has no rows on the line
    /// (its head row still says it, and its menu picks another).
    func loadDrawings(_ picks: [ProcedurePick]) async {
        for pick in picks {
            let key = Self.drawingKey(pick)
            guard drawings[key] == nil, !asking.contains(key) else { continue }
            asking.insert(key)
            defer { asking.remove(key) }
            guard let drawn = try? await Planner.procedure(pick.ident, id: pick.id, transition: pick.transition), !Task.isCancelled else { continue }
            drawings[key] = drawn
        }
    }

    /// A card not had, as the web's timeline says it.
    static func failedWords(_ ident: String, _ error: any Error) -> String {
        error is URLError ? "No connection. Whether \(ident) is open is not known." : "Whether \(ident) is open could not be checked."
    }
}
