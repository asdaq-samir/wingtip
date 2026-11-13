import Foundation
import MapKit

/// The reporting fields' weather about the view, for their marks (the
/// web's AirportsGl TileAirports, Android's MapWeather): the planner's
/// /api/airports/in-view with `reporting`, each field's METAR as the
/// planner read it and its category the engine's (flight_category,
/// AIM 7-1-7). The phone's packs answer the fields themselves with no
/// weather, so this is joined onto them by ident. Asked as the map rests
/// outside the box last asked, and again every ten minutes, as a METAR
/// can change by the hour; what was heard is kept, so a pan back, or one
/// with no signal, keeps its weather.
@MainActor
final class FieldWeatherFeed {
    /// Ten minutes, the web's WEATHER_EVERY_MS.
    static let every: TimeInterval = 10 * 60
    /// About the country's reporting fields, twice over.
    static let most = 6000

    private(set) var reports: [String: AirportPin] = [:]
    /// When each field's report was last heard from the planner, for its
    /// mark's age once it is stale (FieldWeatherMarks.aged).
    private(set) var heardAt: [String: Date] = [:]
    private var asked: Box?
    private var askedAt = Date.distantPast
    private var asking: Task<Void, Never>?

    /// A box of whole half degrees round the view and as much again each
    /// way (the web's "some nine views"), so a small pan asks nothing.
    struct Box: Equatable {
        var south, west, north, east: Double

        func holds(_ view: ViewBox) -> Bool {
            view.south >= south && view.north <= north && view.west >= west && view.east <= east
        }

        static func about(_ view: ViewBox) -> Box {
            let dLat = view.north - view.south, dLon = view.east - view.west
            func down(_ x: Double) -> Double { (x * 2).rounded(.down) / 2 }
            func up(_ x: Double) -> Double { (x * 2).rounded(.up) / 2 }
            return Box(south: down(max(-90, view.south - dLat)), west: down(max(-180, view.west - dLon)),
                       north: up(min(90, view.north + dLat)), east: up(min(180, view.east + dLon)))
        }
    }

    /// The map at rest on `view`: asked where it left the box asked or the
    /// answer is old; `heard` told once the answer is in.
    func view(_ view: ViewBox, heard: @escaping @MainActor () -> Void) {
        if let asked, asked.holds(view), Date().timeIntervalSince(askedAt) < Self.every { return }
        let next = Box.about(view)
        asked = next
        askedAt = Date()
        asking?.cancel()
        asking = Task { [weak self] in
            do {
                let fields = try await Planner.airports(south: next.south, west: next.west, north: next.north, east: next.east,
                                                        limit: 1000, reporting: true)
                guard !Task.isCancelled, let self else { return }
                self.reports = Self.merged(self.reports, fields)
                let now = Date()
                for pin in fields { self.heardAt[pin.ident] = now }
                self.heardAt = self.heardAt.filter { self.reports[$0.key] != nil }
                heard()
            } catch {
                // No signal or the planner down: what was heard stands,
                // and the next rest asks again.
                self?.askedAt = .distantPast
            }
        }
    }

    /// What was heard before with the newest over it; at most `most` kept.
    static func merged(_ was: [String: AirportPin], _ now: [AirportPin]) -> [String: AirportPin] {
        var out = was
        for pin in now { out[pin.ident] = pin }
        guard out.count > most else { return out }
        let fresh = Set(now.map(\.ident))
        for ident in out.keys where !fresh.contains(ident) && out.count > most { out[ident] = nil }
        return out
    }
}
