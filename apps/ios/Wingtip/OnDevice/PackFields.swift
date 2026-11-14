import Foundation

/// The fields round a point with no planner: the FAA's NASR airports in
/// the cycle packs kept on the phone (the engine's airports_in_view),
/// ranked by the engine's best_fields. Nearest, the emergency assistant
/// and the on-device Ask all take their fields from here when the planner
/// cannot be reached (the offline audit, 2026-11-10). The packs carry no
/// weather, elevations or runways, so a field here has none: the engine
/// then ranks by distance, or by reach where the airplane's glide is known,
/// and says what it could not weigh. Nothing is measured here but by the
/// engine.
enum PackFields {
    /// What finds the fields in a box (FlightFigures.Pins): the packs, or a test's.
    typealias Pins = FlightFigures.Pins

    /// How far round the point the packs are read: about 30 nm each way,
    /// past a light single's glide from 10,000 ft (about 16 nm at 10 to 1).
    /// A box to read, not a rule; the engine ranks what is in it.
    static let boxDeg = 0.5

    /// The fields in the box round a point; nil where no region's pack is
    /// kept there, [] where one is and holds none.
    static func near(lat: Double, lon: Double, pins: Pins) -> [AirportPin]? {
        let dLon = boxDeg / max(cos(lat * .pi / 180), 0.2)
        return pins(lat - boxDeg, lon - dLon, lat + boxDeg, lon + dLon)
    }

    /// The pins as the engine's candidates: no elevation, runway or METAR,
    /// which the packs do not hold; `military` as the packs give it,
    /// "military" or "joint", for the engine to tell them apart. The packs
    /// hold open fields only (NASR ARPT_STATUS O), so no status is sent.
    static func candidates(_ found: [AirportPin]) -> [EngineContract.BestFieldsInputFieldsItem] {
        found.map {
            EngineContract.BestFieldsInputFieldsItem(ident: $0.ident, name: $0.name, lat: $0.lat, lon: $0.lon, elevationFt: nil, runways: [],
                                                     metar: nil, towered: $0.towered, private: $0.isPrivate, military: $0.military)
        }
    }

    /// The fields round a point ranked by the engine's best_fields in glide
    /// mode with no airplane: nearest first, each with its distance and true
    /// course. Nil where no pack is kept there.
    static func ranked(lat: Double, lon: Double, altitudeFt: Double? = nil, speedKt: Double? = nil, limit: Int,
                       pins: Pins) throws -> (pins: [AirportPin], ranked: EngineContract.BestFieldsAnswer)? {
        guard let found = near(lat: lat, lon: lon, pins: pins) else { return nil }
        guard !found.isEmpty else { return ([], EngineContract.BestFieldsAnswer(mode: "glide", needsAirplane: true, glide: nil, fields: [])) }
        let ranked = try Engine.bestFields(mode: "glide", at: .init(lat: lat, lon: lon), altitudeFt: altitudeFt, speedKt: speedKt,
                                           fields: candidates(found), limit: Double(limit))
        return (found, ranked)
    }

    /// Nearest's list from the packs, nearest first: each field's distance
    /// and true course the engine's; no weather, which the packs do not
    /// hold. Nil where no pack is kept round the point.
    static func nearest(lat: Double, lon: Double, limit: Int, pins: Pins = FlightFigures.packPins) throws -> [NearestAirport]? {
        guard let kept = try ranked(lat: lat, lon: lon, limit: limit, pins: pins) else { return nil }
        let byIdent = Dictionary(kept.pins.map { ($0.ident, $0) }, uniquingKeysWith: { a, _ in a })
        return kept.ranked.fields.map { field in
            let pin = byIdent[field.ident]
            return NearestAirport(airspaceClass: pin?.airspaceClass, bearingDeg: field.courseDeg, distanceNm: field.distanceNm,
                                  ident: field.ident, kind: pin?.kind ?? "airport", lat: field.lat, lon: field.lon,
                                  military: pin?.military, name: field.name, isPrivate: field.private, towered: field.towered)
        }
    }
}

extension Planner {
    /// Where a list of fields came from: the planner's, with its weather,
    /// or the packs on this iPhone, without.
    enum FieldsFrom: Equatable, Sendable { case planner, device }

    /// The fields nearest a point, the planner's, or with no answer from it
    /// in inFlight's five seconds the packs' (PackFields.nearest), said as
    /// such by the caller. Thrown only where neither can answer.
    static func nearestOrPacks(lat: Double, lon: Double, limit: Int = 10,
                               pins: PackFields.Pins = FlightFigures.packPins) async throws -> (fields: [NearestAirport], from: FieldsFrom) {
        do {
            return (try await nearest(lat: lat, lon: lon, limit: limit), .planner)
        } catch {
            if Task.isCancelled { throw error }
            guard let kept = try PackFields.nearest(lat: lat, lon: lon, limit: limit, pins: pins) else { throw error }
            return (kept, .device)
        }
    }
}

/// The search's airports with no planner: every field in the cycle packs
/// kept on this iPhone, matched by ident or name as typed. The engine
/// reads the packs (airports_in_view, at most 300 fields a call, so each
/// kept region is read in half-degree cells); the matching is the
/// search's own, no aviation rule.
enum PackSearch {
    /// The cell each region is read in: small enough that no cell holds
    /// the engine's 300 fields a call, even round Los Angeles.
    static let cellDeg = 0.5

    /// Every field in the regions kept, once per cycle, read off the main
    /// thread (it reads each region's table some 64 times).
    static func allKept(packs: CyclePacks = .shared) -> [AirportPin] {
        guard let index = packs.index else { return [] }
        var seen = Set<String>()
        var out: [AirportPin] = []
        for region in index.regions where FileManager.default.fileExists(atPath: packs.path(cycle: index.cycle, region: region.name).path) {
            var south = region.south
            while south < region.north {
                var west = region.west
                while west < region.east {
                    for pin in packs.airportsInView(south: south, west: west, north: south + cellDeg, east: west + cellDeg) ?? [] where seen.insert(pin.ident).inserted {
                        out.append(pin)
                    }
                    west += cellDeg
                }
                south += cellDeg
            }
        }
        return out
    }

    /// The fields matching what was typed, best first: the ident itself
    /// (KOSH, or OSH for KOSH), an ident starting with it, a name starting
    /// with it, then a name holding it; each with its use, the engine's,
    /// as the planner's search marks it.
    static func search(_ q: String, in pins: [AirportPin], limit: Int = 12) -> [AirportSuggestion] {
        let typed = q.trimmingCharacters(in: .whitespaces).uppercased()
        guard typed.count >= 2 else { return [] }
        func rank(_ pin: AirportPin) -> Int? {
            let ident = pin.ident.uppercased(), name = pin.name.uppercased()
            if ident == typed || ident == "K" + typed { return 0 }
            if ident.hasPrefix(typed) { return 1 }
            if name.hasPrefix(typed) { return 2 }
            if name.contains(typed) { return 3 }
            return nil
        }
        return pins.compactMap { pin in rank(pin).map { ($0, pin) } }
            .sorted { ($0.0, $0.1.ident) < ($1.0, $1.1.ident) }
            .prefix(limit)
            .map { AirportSuggestion(ident: $0.1.ident, kind: $0.1.kind, name: $0.1.name,
                                     use: FieldUse.code(isPrivate: $0.1.isPrivate, military: $0.1.military)) }
    }
}
