import Foundation
import Observation
import SwiftUI

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
    /// The field's prompt, a key so the string catalog gathers it and a
    /// second language translates it (Localizable.xcstrings).
    static let prompt: LocalizedStringKey = "Search airports, airplanes, or ask"
    /// The field's prompt while Ask by voice listens, nothing said yet.
    static let speak: LocalizedStringKey = "Speak your question"
    /// The field's prompt after the welcome, asking for the first flight's
    /// destination (the web's first flight, lib/oneSearch's pick), until
    /// something is typed or the search is put away.
    static let whereTo: LocalizedStringKey = "Where are you flying to?"

    var text = "" { didSet { if !text.isEmpty { askingDestination = false } } }
    /// The welcome put away: the field asks for the destination, not
    /// focused, so no keyboard comes up until the pilot taps it.
    var askingDestination = false
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
    /// The airports shown are this iPhone's packs', the planner not
    /// answering (PackSearch): said over them.
    private(set) var fromDevice = false
    /// The packs' fields, read once the planner first fails to answer.
    @ObservationIgnored private var keptFields: [AirportPin]?
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
                fromDevice = false
            case .failure(let error):
                // With no planner, the airports kept on this iPhone that
                // match; the fixes, towns and registry need the planner.
                if keptFields == nil { keptFields = await Task.detached(priority: .userInitiated) { PackSearch.allKept() }.value }
                guard !Task.isCancelled else { return }
                airports = PackSearch.search(q, in: keptFields ?? [])
                fixes = []
                fromDevice = !airports.isEmpty
                failed = Self.failedWords(error, kept: !airports.isEmpty)
            }
            towns = (spots ?? []).filter { $0.kind != "airport" }
            registered = registration
        }
    }

    /// What a failed search says: no connection said as such, with what
    /// the iPhone could still find.
    static func failedWords(_ error: any Error, kept: Bool) -> String {
        guard error is URLError else { return "The search couldn't be done: \(error.localizedDescription)" }
        return kept ? "No connection: airports from the chart data on this iPhone only. Waypoints, towns and N-numbers need a connection."
            : "No connection: the search needs one, and no airport kept on this iPhone matches."
    }

    private nonisolated static func fields(_ q: String) async -> Result<[AirportSuggestion], any Error> {
        do { return .success(try await Planner.search(q, fixes: true)) } catch { return .failure(error) }
    }

    private nonisolated static func registry(_ tail: String) async -> AircraftRegistration? {
        (try? await Planner.registered(tail)) ?? nil
    }

    private func clearFound() {
        airports = []; fixes = []; towns = []; registered = nil; fromDevice = false
    }

    /// The planner's airplane types, asked once.
    func loadTypes() async {
        guard types.isEmpty, let all = try? await Planner.aircraftProfiles() else { return }
        types = all
    }

    /// The fields nearest the airplane, for the Nearest group.
    func findNearest(_ fix: OwnShip.Fix?) async {
        guard let at = fix?.coordinate else { return }
        // With no planner, the packs' fields (PackFields), nearest first.
        if let found = try? await Planner.nearestOrPacks(lat: at.latitude, lon: at.longitude, limit: 25) { nearest = found.fields }
    }

    /// The search put away, what was typed with it.
    func close() {
        presented = false
        askingDestination = false
        text = ""
        clearFound()
    }
}
