import CoreLocation
import Foundation
import Observation

/// The flight's instruments in the air (#218, the owner's option A of
/// 2026-11-08), the view model the map's instruments bar, the strip's
/// figures and the glide ring read: each fix -- own ship's, or the dry
/// run's airplane -- asked of the engine once, and the answers kept. The
/// engine works every figure (motion::instruments): where the airplane is
/// on the route and the next waypoint's distance, time and arrival
/// (`in_flight`), the vertical speed from the GPS's altitudes
/// (`vertical_speed`), and the still-air glide ring over the ground under
/// it (`glide_ring`). Nothing is worked out here.
///
/// A planning aid beside the airplane's own instruments: a phone's GPS is
/// not an approved navigation source (AC 120-76D), and the bar says so.
@MainActor
@Observable
final class InFlight {
    static let shared = InFlight()

    /// One waypoint ahead, as `in_flight` answers it.
    struct Waypoint: Decodable, Equatable, Sendable {
        let index: Int
        let name: String
        let distanceNm: Double
        let bearingDeg: Double
        let bearingMagDeg: Double?
        let eteMin: Double?
        let etaS: Double?
        let fuelLeftGal: Double?
    }

    /// The airplane against its route, as `in_flight` answers it.
    struct Progress: Decodable, Equatable, Sendable {
        let onRoute: Bool
        let alongNm: Double
        let totalNm: Double
        let leftNm: Double
        let offNm: Double
        let offSide: String?
        let desiredTrackDeg: Double
        let desiredTrackMagDeg: Double?
        let trackMagDeg: Double?
        let trackErrorDeg: Double?
        let variationDeg: Double?
        let burntGal: Double
        let next: Waypoint?
        let destination: Waypoint?
    }

    /// The glide ring, as `glide_ring` answers it.
    struct Glide: Decodable, Equatable, Sendable {
        let rangeNm: Double
        let groundFt: Double
        let ring: [[Double]]

        var coordinates: [CLLocationCoordinate2D] {
            ring.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
        }
    }

    private(set) var fix: OwnShip.Fix?
    private(set) var progress: Progress?
    private(set) var verticalFpm: Double?
    private(set) var glide: Glide?
    /// The ground under the airplane from the packs kept on the phone
    /// (the packs' ahead answer, OwnShip), the ring's first ground.
    var terrainFt: Double?
    /// The nearest field's elevation, the ring's ground where no pack
    /// reaches, asked of the planner now and then while moving.
    private(set) var fieldFt: Double?
    private var fieldAskedAt: Date?
    private var fieldAsking: Task<Void, Never>?
    /// The GPS altitudes of the last seconds, for the vertical speed.
    private var altitudes: [(t: Double, ft: Double)] = []

    /// How often the nearest field is asked for the ring's ground, s: a
    /// field's elevation changes slowly as an airplane flies.
    static let fieldEveryS: TimeInterval = 60

    /// At flying speed by the engine's `underway` (Flight.underway).
    var underway: Bool { Flight.underway(fix?.groundspeedKt) }

    /// Flying the route: moving and within the engine's ON_ROUTE_NM of the
    /// line, where the figures count down from the airplane (FiguresStrip,
    /// the strip's flying look).
    var onRoute: Bool { progress?.onRoute == true }

    /// The fix taken: the instruments worked out again from it and the
    /// plan. A nil fix (own ship off, no dry run) clears them.
    func took(_ fix: OwnShip.Fix?, plan: Plan, now: Date = Date()) {
        guard let fix else {
            self.fix = nil
            progress = nil
            verticalFpm = nil
            glide = nil
            altitudes = []
            return
        }
        self.fix = fix
        let at = fix.coordinate
        progress = Self.progress(fix, plan: plan, now: now)
        // The altitudes of the last seconds; the engine keeps its own
        // window of them (VS_WINDOW_S), so a little more is kept here.
        let t = fix.at.timeIntervalSince1970
        if let ft = fix.altitudeFt {
            altitudes.removeAll { $0.t >= t || $0.t < t - 15 }
            altitudes.append((t, ft))
        }
        verticalFpm = try? Engine.call("vertical_speed", json: [
            "samples": altitudes.map { ["t_s": $0.t, "altitude_ft": $0.ft] },
        ])
        glide = try? Engine.call("glide_ring", json: [
            "lat": at.latitude, "lon": at.longitude, "altitude_ft": fix.altitudeFt, "speed_kt": fix.groundspeedKt,
            "terrain_ft": terrainFt, "field_ft": fieldFt,
        ], decoder: Planner.snakeCase)
        if underway { askField(at, now: now) }
    }

    /// The engine's `in_flight` for a fix on the plan's route; nil with no
    /// route.
    static func progress(_ fix: OwnShip.Fix, plan: Plan, now: Date = Date()) -> Progress? {
        guard let course = plan.course, course.coordinates.count >= 2 else { return nil }
        let points = RouteShare.points(plan).map { ["name": $0.name, "lat": $0.lat, "lon": $0.lon] as [String: Any] }
        return try? Engine.call("in_flight", json: [
            "fix": [
                "lat": fix.coordinate.latitude, "lon": fix.coordinate.longitude,
                "track_deg": fix.trackDeg as Any, "speed_kt": fix.groundspeedKt as Any,
            ] as [String: Any],
            "line": course.coordinates.map { [$0.latitude, $0.longitude] },
            "points": points,
            "legs": plan.legs.map { ["distance_nm": $0.distanceNm, "fuel_gal": $0.fuelGal as Any] as [String: Any] },
            "fuel_start_gal": plan.totals?.usableFuelGal,
            "now_s": now.timeIntervalSince1970,
        ], decoder: Planner.snakeCase)
    }

    /// The nearest field's elevation for the ring's ground, asked at most
    /// once a minute; the planner may be out of reach in the air, and the
    /// last answer stands then.
    private func askField(_ at: CLLocationCoordinate2D, now: Date) {
        if let asked = fieldAskedAt, now.timeIntervalSince(asked) < Self.fieldEveryS { return }
        fieldAskedAt = now
        fieldAsking?.cancel()
        fieldAsking = Task { [weak self] in
            guard let field = try? await Planner.nearest(lat: at.latitude, lon: at.longitude, limit: 1).first,
                  !Task.isCancelled else { return }
            self?.fieldFt = field.elevationFt
        }
    }
}
