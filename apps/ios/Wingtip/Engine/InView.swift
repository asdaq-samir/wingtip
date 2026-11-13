import Foundation
import WingtipEngine

/// What the map draws, from the packs kept on the phone (the engine's
/// view module through WingtipEngine's airspaceInView, airportsInView and
/// navaidsInView): the planner's own answers for /api/airspace/in-view,
/// /api/airports/in-view and /api/navaids/in-view, worked out on the phone
/// from the regions the pilot keeps, so a pan in flight with no signal
/// still has its fields, rings and VORs (PackMapData asks here first).
/// A field's live flight category is the planner's alone: null here.
extension CyclePacks {
    /// The paths of the packs of every region the box touches; nil where
    /// none of them was ever kept.
    private func packs(south: Double, west: Double, north: Double, east: Double) -> [String]? {
        guard let index else { return nil }
        // The regions are 4° squares (Engine.region): every 2° across the
        // box and its far edges names each one the box touches.
        var names = Set<String>()
        var lat = south
        while lat <= north + 2 {
            var lon = west
            while lon <= east + 2 {
                names.insert(Engine.region(lat: min(lat, north), lon: min(lon, east)))
                lon += 2
            }
            lat += 2
        }
        let packs = kept(names, cycle: index.cycle)
        return packs.isEmpty ? nil : packs
    }

    /// The paths of these regions' packs the phone has, which the engine
    /// maps for the one call (as Ahead.swift asks it too).
    func kept(_ regions: Set<String>, cycle: String) -> [String] {
        regions.sorted().map { path(cycle: cycle, region: $0).path }.filter { FileManager.default.fileExists(atPath: $0) }
    }

    /// One of the engine's in-view readers: the packs' paths and the box,
    /// its answer as JSON text.
    typealias Reader = ([String], Double, Double, Double, Double) -> String

    /// One of the engine's in-view answers, decoded as the planner's:
    /// the planner's generated types with their own keys (Planner.json),
    /// the app's own in camel case (Planner.snakeCase).
    private func inView<T: Decodable>(_ type: T.Type, decoder: JSONDecoder = Planner.json, south: Double, west: Double, north: Double, east: Double,
                                      _ call: Reader) -> T? {
        guard let packs = packs(south: south, west: west, north: north, east: east) else { return nil }
        return Self.inView(type, decoder: decoder, packs: packs, south: south, west: west, north: north, east: east, call)
    }

    /// The same, from packs' paths in hand.
    static func inView<T: Decodable>(_ type: T.Type, decoder: JSONDecoder = Planner.json, packs: [String], south: Double, west: Double, north: Double, east: Double,
                                     _ call: Reader) -> T? {
        try? decoder.decode(T.self, from: Data(call(packs, south, west, north, east).utf8))
    }

    struct AreasAnswer: Decodable { let areas: [ChartMarks.Area] }
    struct FixesAnswer: Decodable { let fixes: [ChartMarks.Fix] }

    /// The special-use areas reaching into the box (the engine's
    /// special_use_in_view), MOAs first; nil with no pack.
    func specialUseInView(south: Double, west: Double, north: Double, east: Double) -> [ChartMarks.Area]? {
        inView(AreasAnswer.self, decoder: Planner.snakeCase, south: south, west: west, north: north, east: east, WingtipEngine.specialUseInView)?.areas
    }

    /// The Enroute Low fixes and charted VFR waypoints in the box; nil with no pack.
    func fixesInView(south: Double, west: Double, north: Double, east: Double) -> [ChartMarks.Fix]? {
        inView(FixesAnswer.self, decoder: Planner.snakeCase, south: south, west: west, north: north, east: east, WingtipEngine.fixesInView)?.fixes
    }

    private struct AirportsAnswer: Decodable { let airports: [AirportPin] }

    /// The fields in the box (AirportsInView), biggest first; nil with no pack.
    func airportsInView(south: Double, west: Double, north: Double, east: Double) -> [AirportPin]? {
        inView(AirportsAnswer.self, south: south, west: west, north: north, east: east, WingtipEngine.airportsInView)?.airports
    }

    /// The fields in the box from packs' paths in hand (the tests' Chicago cut).
    static func airportsInView(packs: [String], south: Double, west: Double, north: Double, east: Double) -> [AirportPin]? {
        inView(AirportsAnswer.self, packs: packs, south: south, west: west, north: north, east: east, WingtipEngine.airportsInView)?.airports
    }

    /// The Class B, C, D and surface E volumes in the box with their rings
    /// (AirspaceInView), as JSON text for the map's own decoder; nil with no pack.
    func airspaceInView(south: Double, west: Double, north: Double, east: Double) -> Data? {
        guard let packs = packs(south: south, west: west, north: north, east: east) else { return nil }
        return Data(WingtipEngine.airspaceInView(packs: packs, south: south, west: west, north: north, east: east).utf8)
    }

    /// The VORs in the box (NavaidsInView's vors); nil with no pack.
    func navaidsInView(south: Double, west: Double, north: Double, east: Double) -> Data? {
        guard let packs = packs(south: south, west: west, north: north, east: east) else { return nil }
        return Data(WingtipEngine.navaidsInView(packs: packs, south: south, west: west, north: north, east: east).utf8)
    }

    // MARK: Off the main actor

    // The map's asks as it moves, each off the main actor (@concurrent):
    // a pinch that crossed a zoom level asked up to five of these within
    // one frame, each reading the packs and decoding the engine's answer.
    // The map takes each answer back on the main actor if its view still
    // wants it (ViewFetch).

    /// The special-use areas in a box; nil with no pack.
    @concurrent func specialUseInView(_ box: ViewBox) async -> [ChartMarks.Area]? {
        specialUseInView(south: box.south, west: box.west, north: box.north, east: box.east)
    }

    /// The fixes and VFR waypoints in a box; nil with no pack.
    @concurrent func fixesInView(_ box: ViewBox) async -> [ChartMarks.Fix]? {
        fixesInView(south: box.south, west: box.west, north: box.north, east: box.east)
    }

    /// The fields in a box; nil with no pack.
    @concurrent func airportsInView(_ box: ViewBox) async -> [AirportPin]? {
        airportsInView(south: box.south, west: box.west, north: box.north, east: box.east)
    }

    /// The airspace volumes in a box: nil with no pack, .some(nil) where
    /// the engine's answer could not be read.
    @concurrent func airspaceVolumesInView(_ box: ViewBox) async -> [AirspaceVolume]?? {
        struct Answer: Decodable { let volumes: [AirspaceVolume] }
        guard let data = airspaceInView(south: box.south, west: box.west, north: box.north, east: box.east) else { return nil }
        return .some(try? Planner.snakeCase.decode(Answer.self, from: data).volumes)
    }

    /// The VORs in a box: nil with no pack, .some(nil) where the engine's
    /// answer could not be read.
    @concurrent func vorsInView(_ box: ViewBox) async -> [VorPin]?? {
        struct Answer: Decodable { let vors: [VorPin] }
        guard let data = navaidsInView(south: box.south, west: box.west, north: box.north, east: box.east) else { return nil }
        return .some(try? Planner.snakeCase.decode(Answer.self, from: data).vors)
    }
}
