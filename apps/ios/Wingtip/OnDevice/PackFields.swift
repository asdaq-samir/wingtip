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
    /// which the packs do not hold.
    static func candidates(_ found: [AirportPin]) -> [EngineContract.BestFieldsInputFieldsItem] {
        found.map {
            EngineContract.BestFieldsInputFieldsItem(ident: $0.ident, name: $0.name, lat: $0.lat, lon: $0.lon, elevationFt: nil, runways: [],
                                                     metar: nil, towered: $0.towered, private: $0.isPrivate, military: $0.military != nil)
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
