import Foundation
import Observation

/// The one search's state (the owner's one-search design, 2026-11-09):
/// what is typed and whether the search is up, and what it found as it
/// was typed, from the planner's existing searches -- fields and named
/// fixes (/api/airports/search with fixes), towns and addresses
/// (/api/places/search), an N-number in the FAA's registry
/// (/api/traffic/find), the planner's airplane types
/// (/api/aircraft-profiles) -- with the pilot's own airplanes
/// (Airplanes) and the Do rows (SearchActions). Nothing typed, the
/// fields nearest the airplane for the Nearest group. One per sheet, as
/// the root view keeps it (RootView), so a link, Siri and the map can
/// bring the search up.
@MainActor
@Observable
final class OneSearchModel {
    static let prompt = "Search airports, airplanes, or ask"
    /// The field's prompt while Ask by voice listens, nothing said yet.
    static let speak = "Speak your question"

    var text = ""
    /// The search up: the field focused and its suggestions in sight.
    var presented = false
    /// Why a line sent or said was not done, said under the field.
    var problem: String?
    var busy = false

    private(set) var airports: [AirportSuggestion] = []
    private(set) var fixes: [AirportSuggestion] = []
    private(set) var towns: [PlaceFound] = []
    private(set) var registered: AircraftRegistration?
    private(set) var types: [AircraftProfile] = []
    private(set) var nearest: [NearestAirport] = []
    /// The planner did not answer the last search: said in its place.
    private(set) var failed: String?
    @ObservationIgnored private var searching: Task<Void, Never>?

    var query: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// The airplane types whose name, designator or type matches.
    var matchingTypes: [AircraftProfile] {
        let q = query.lowercased()
        guard q.count >= 2 else { return [] }
        return types.filter { [$0.name, $0.designator, $0.type].compactMap { $0?.lowercased() }.contains { $0.contains(q) } }.prefix(4).map { $0 }
    }

    /// The pilot's own airplanes whose N-number or type matches.
    func ownMatching(_ records: [OwnAircraftRecord]) -> [OwnAircraftRecord] {
        let q = query.uppercased()
        guard !q.isEmpty else { return [] }
        return records.filter { $0.tailNumber.uppercased().contains(q) || $0.typeDesignator.uppercased().contains(q) }
    }

    /// The N-number typed, where it is one (the engine's n_number,
    /// 14 CFR 47.15(b)) and not already one of the pilot's own.
    func typedTail(_ records: [OwnAircraftRecord]) -> String? {
        let tail = query.uppercased()
        guard isNNumber(tail), !records.contains(where: { $0.tailNumber.uppercased() == tail }) else { return nil }
        return tail
    }

    /// The Do rows for what is typed (SearchActions).
    func actions(routed: Bool) -> [SearchAction] {
        SearchActions.list(for: query, routed: routed, firstIdent: airports.first?.ident ?? fixes.first?.ident)
    }

    /// Asked again as the text changes, once the typing stops: the fields
    /// and fixes, the towns and, for an N-number, the registry, together.
    func typed() {
        searching?.cancel()
        failed = nil
        let q = query
        guard q.count >= 2 else { clearFound(); return }
        let tailTyped = isNNumber(q)
        searching = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            async let found = Self.fields(q)
            // The geocoder is a request a word, not a letter: asked once the
            // typing has stopped, as the fields are.
            async let places = try? Planner.places(q)
            async let tail = tailTyped ? Self.registry(q.uppercased()) : nil
            let (answer, spots, registration) = await (found, places, tail)
            guard !Task.isCancelled, let self else { return }
            switch answer {
            case .success(let list):
                airports = list.filter { $0.kind != "fix" }
                fixes = list.filter { $0.kind == "fix" }
            case .failure(let error):
                airports = []; fixes = []
                failed = error.localizedDescription
            }
            towns = (spots ?? []).filter { $0.kind != "airport" }
            registered = registration
        }
    }

    private nonisolated static func fields(_ q: String) async -> Result<[AirportSuggestion], any Error> {
        do { return .success(try await Planner.search(q, fixes: true)) } catch { return .failure(error) }
    }

    private nonisolated static func registry(_ tail: String) async -> AircraftRegistration? {
        (try? await Planner.registered(tail)) ?? nil
    }

    private func clearFound() {
        airports = []; fixes = []; towns = []; registered = nil
    }

    /// The planner's airplane types, asked once.
    func loadTypes() async {
        guard types.isEmpty, let all = try? await Planner.aircraftProfiles() else { return }
        types = all
    }

    /// The fields nearest the airplane, for the Nearest group.
    func findNearest(_ fix: OwnShip.Fix?) async {
        guard let at = fix?.coordinate else { return }
        if let fields = try? await Planner.nearest(lat: at.latitude, lon: at.longitude, limit: 25) { nearest = fields }
    }

    /// The search put away, what was typed with it.
    func close() {
        presented = false
        text = ""
        clearFound()
    }
}
