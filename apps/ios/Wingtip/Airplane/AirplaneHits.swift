import Foundation

/// The airplane rows a typed text finds, one source for the one search's
/// Airplanes group and the FPL airplane field's suggestions (the owner's
/// S1, 2026-11-14; the web's useAirplaneHits): the pilot's own airplanes
/// whose N-number or type matches, the N-number typed itself once it is a
/// whole one (the engine's n_number, 14 CFR 47.15(b)) with its FAA record,
/// and the planner's types that match.
enum AirplaneHits {
    /// The pilot's own airplanes whose N-number or type matches.
    static func own(_ query: String, in records: [OwnAircraftRecord]) -> [OwnAircraftRecord] {
        let q = query.uppercased()
        guard !q.isEmpty else { return [] }
        return records.filter { $0.tailNumber.uppercased().contains(q) || $0.typeDesignator.uppercased().contains(q) }
    }

    /// The N-number typed, where it is one and not already one of the
    /// pilot's own.
    static func typedTail(_ query: String, own records: [OwnAircraftRecord]) -> String? {
        let tail = query.uppercased()
        guard isNNumber(tail), !records.contains(where: { $0.tailNumber.uppercased() == tail }) else { return nil }
        return tail
    }

    /// The airplanes the map hears whose callsign, registration or ICAO
    /// address begins with what is typed (a registration's hyphen aside),
    /// three letters at least, eight at most: the one search finds them
    /// as the retired traffic page did (the web's useHeardHits).
    static func heard(_ query: String, in planes: [TrafficAircraft]) -> [TrafficAircraft] {
        let text = query.filter { !$0.isWhitespace }.uppercased()
        guard text.count >= 3 else { return [] }
        return Array(planes.filter { named($0, text) }.prefix(8))
    }

    /// Whether an airplane's callsign, registration or address begins with `text`.
    static func named(_ plane: TrafficAircraft, _ text: String) -> Bool {
        let bare = text.replacingOccurrences(of: "-", with: "")
        return (plane.callsign ?? "").uppercased().hasPrefix(text)
            || (plane.registration ?? "").replacingOccurrences(of: "-", with: "").uppercased().hasPrefix(bare)
            || plane.hex.uppercased().hasPrefix(text)
    }

    /// The planner's types that match, the first four.
    static func types(_ query: String, in types: [AircraftProfile]) -> [AircraftProfile] {
        let q = query.lowercased()
        guard q.count >= 2 else { return [] }
        return types.filter { [$0.name, $0.designator, $0.type].compactMap { $0?.lowercased() }.contains { $0.contains(q) } }.prefix(4).map { $0 }
    }

    /// The FAA record's line beside its N-number: "Piper PA-28-140 · FAA
    /// registry", or "FAA registry" with no type in it.
    static func registryLine(_ registration: AircraftRegistration) -> String {
        let name = [registration.manufacturer, registration.model].compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }.joined(separator: " ")
        return name.isEmpty ? "FAA registry" : "\(name) · FAA registry"
    }
}
