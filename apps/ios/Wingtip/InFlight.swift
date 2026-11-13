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
    /// The airplane against its route, as `in_flight` answers it (the
    /// engine's contract, Engine/Generated).
    typealias Progress = EngineContract.InFlightAnswer
    /// The destination ahead, as `in_flight` answers it.
    typealias Waypoint = EngineContract.InFlightAnswerDestination
    /// The glide ring, as `glide_ring` answers it.
    typealias Glide = EngineContract.GlideRingAnswer

    private(set) var fix: OwnShip.Fix?
    private(set) var progress: Progress?
    private(set) var verticalFpm: Double?
    private(set) var glide: Glide?
    /// At flying speed by the engine's `underway` (Flight.underway), as of
    /// the last fix; false until one is taken.
    private(set) var underway = false
    /// What the engine could not work out at the last fix, for the
    /// instruments bar: the figures it refused are blank, not guessed.
    private(set) var problem: String?
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

    /// Flying the route: moving and within the engine's ON_ROUTE_NM of the
    /// line, where the figures count down from the airplane (FiguresStrip,
    /// the strip's flying look).
    var onRoute: Bool { progress?.onRoute == true }

    /// The fix taken: the instruments worked out again from it and the
    /// plan. A nil fix (own ship off, no dry run) clears them.
    func took(_ fix: OwnShip.Fix?, plan: Plan, emergency: Bool = false, now: Date = Date()) {
        guard let fix else {
            self.fix = nil
            progress = nil
            verticalFpm = nil
            glide = nil
            underway = false
            problem = nil
            altitudes = []
            return
        }
        self.fix = fix
        let at = fix.coordinate
        // The altitudes of the last seconds; the engine keeps its own
        // window of them (VS_WINDOW_S), so a little more is kept here.
        let t = fix.at.timeIntervalSince1970
        if let ft = fix.altitudeFt {
            altitudes.removeAll { $0.t >= t || $0.t < t - 15 }
            altitudes.append((t, ft))
        }
        // Each figure the engine refuses is left blank and named in
        // `problem`; the others still show.
        var refused: [String] = []
        func asked<T>(_ what: String, _ body: () throws -> T?) -> T? {
            do { return try body() } catch {
                refused.append("\(what): \(error.localizedDescription)")
                return nil
            }
        }
        underway = asked("flying speed") { try Flight.underway(fix.groundspeedKt) } ?? false
        progress = asked("route") { try Self.progress(fix, plan: plan, now: now) }
        verticalFpm = asked("vertical speed") {
            try Engine.verticalSpeed(samples: altitudes.map { .init(tS: $0.t, altitudeFt: $0.ft) })
        }
        // The ring only where it is wanted and the airplane's own glide
        // is known (ringRatio): none is drawn on any other airplane's.
        let ratio = Self.ringRatio(plan: plan, emergency: emergency)
        glide = ratio == nil ? nil : asked("glide ring") {
            try Engine.glideRing(lat: at.latitude, lon: at.longitude, altitudeFt: fix.altitudeFt, speedKt: fix.groundspeedKt,
                                 terrainFt: terrainFt, fieldFt: fieldFt, glideRatio: ratio)
        }
        problem = refused.isEmpty ? nil : "Not worked out: " + refused.joined(separator: "; ")
        if underway { askField(at, now: now) }
    }

    /// The pilot's own switch for the glide ring outside an emergency,
    /// kept on the phone; off by default (the owner, 2026-11-09).
    static let ringKey = "wingtip.glideRing"

    /// The glide ratio the ring is drawn at, or nil for no ring: off by
    /// default, on by itself while the emergency assistant is open (or
    /// where the pilot switched it on, the Map's Glide Ring), and only with
    /// an airplane picked whose figures give its glide ratio (its POH's
    /// Section 3: the pilot's own over its type's book, airplane_figures)
    /// -- never another airplane's.
    static func ringRatio(plan: Plan, emergency: Bool = false, defaults: UserDefaults = .standard, airplanes: Airplanes = .shared) -> Double? {
        guard plan.airplaneChosen, emergency || defaults.bool(forKey: ringKey) else { return nil }
        return airplanes.value(.glideRatio, plan: plan)
    }

    /// The engine's `in_flight` for a fix on the plan's route; nil with no
    /// route, thrown where the engine refuses.
    static func progress(_ fix: OwnShip.Fix, plan: Plan, now: Date = Date()) throws -> Progress? {
        guard let course = plan.course, course.coordinates.count >= 2 else { return nil }
        return try Engine.inFlight(
            fix: .init(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, trackDeg: fix.trackDeg, speedKt: fix.groundspeedKt),
            line: course.coordinates.map { [$0.latitude, $0.longitude] },
            points: RouteShare.points(plan).map { .init(name: $0.name, lat: $0.lat, lon: $0.lon) },
            legs: plan.legs.map { .init(distanceNm: $0.distanceNm, fuelGal: $0.fuelGal) },
            fuelStartGal: plan.totals?.usableFuelGal,
            nowS: now.timeIntervalSince1970)
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

extension EngineContract.GlideRingAnswer {
    /// The ring as points on the map.
    var coordinates: [CLLocationCoordinate2D] {
        ring.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
    }
}
