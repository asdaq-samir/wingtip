import Foundation
import Observation

/// The route's fields' cards, each asked once while FPL shows the route
/// and shared by its timeline's lines (the web's RouteTimeline asks each
/// field's airportQuery the same way): whether NASR lists it closed (the
/// planner's label from the engine's field_status, decision 0043), its
/// latest report's flight category, its runways and its time zone. Kept on
/// this iPhone with the air's answers (KeptForAir), so a field kept for
/// the flight still says itself with no signal. Until a field's card is in
/// it is not known to be open, and its line opens nothing to land by.
@MainActor
@Observable
final class RouteFieldCards {
    private(set) var places: [String: AirportPlace] = [:]
    /// Why a field's card could not be had, said in its line in red: with
    /// no card, whether it is open is not known.
    private(set) var failed: [String: String] = [:]
    @ObservationIgnored private var asking: Set<String> = []

    func place(_ ident: String) -> AirportPlace? { places[ident.uppercased()] }

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
            } catch {
                guard !Task.isCancelled, !(error is CancellationError) else { return }
                failed[ident] = Self.failedWords(ident, error)
            }
        }
    }

    /// A card not had, as the web's timeline says it.
    static func failedWords(_ ident: String, _ error: any Error) -> String {
        error is URLError ? "No connection. Whether \(ident) is open is not known." : "Whether \(ident) is open could not be checked."
    }
}
