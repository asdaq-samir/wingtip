import CoreLocation
import Foundation
import Observation
import OpenAPIRuntime
import UIKit

/// The route flown on the ground, as the web app's dry run flies it
/// (navlog/dryRun.ts): the engine's `dry_run` flies the plan on paper
/// once -- each leg in its own time on its true course at its ground
/// speed, along the course line the map draws, at the heights of the
/// plan's profile -- and the airplane is moved between its reports
/// faster than real time, the figures counting down as they would in the
/// air. Where it is between two reports is worked out here each tick, as
/// the web app does each frame (Replay.position). A rehearsal of the
/// plan, not a fix: own ship's own position is left alone.
@MainActor
@Observable
final class DryRun {
    private(set) var running = false
    /// Seconds of flight flown so far.
    private(set) var flownS = 0.0
    /// How much faster than real time: 1, 10 or 60.
    var speed = 10.0
    private(set) var fix: OwnShip.Fix?
    /// Why the engine could not fly the plan, for the dry run's controls.
    private(set) var problem: String?

    /// The flight flown on paper, its reports' times from its start, s.
    private(set) var points: [Replay.Point] = []
    /// When each nav log row is reached, s from the start (the engine's
    /// `row_t`), and each landing's time: what the forecast run sends.
    private(set) var rowT: [Double] = []
    private(set) var landings: [EngineContract.DryRunAnswerLandingsItem] = []
    /// The course flown, for its fields' places.
    private(set) var course: Course?
    /// When the run's clock starts. The iPhone's plan keeps no departure
    /// time, so it is the moment the run began, as the web's run starts
    /// now when no departure is set; the forecast run plays from it.
    private(set) var startedAt: Date?
    private var ticking: Task<Void, Never>?

    var totalS: Double { points.last?.t ?? 0 }
    var done: Bool { !points.isEmpty && flownS >= totalS }

    /// The plan flown from its departure; nothing where its rows cannot be
    /// laid out from the legs the nav log has (one still on its way).
    func start(course: Course, checkpoints: [Checkpoint], legs: [Leg], at now: Date = Date()) {
        let flown: Flown?
        do { flown = try Self.flight(course: course, checkpoints: checkpoints, legs: legs); problem = nil } catch {
            problem = "The dry run couldn't be flown: \(error.localizedDescription)"
            return
        }
        guard let flown, flown.points.count >= 2 else { return }
        points = flown.points
        rowT = flown.rowT
        landings = flown.landings
        self.course = course
        startedAt = now
        flownS = 0
        running = true
        place()
        tick()
    }

    func pause() { running = false }

    func resume() {
        guard !done, !points.isEmpty else { return }
        running = true
        tick()
    }

    func stop() {
        ticking?.cancel()
        running = false
        fix = nil
        flownS = 0
        points = []
        rowT = []
        landings = []
        course = nil
        startedAt = nil
    }

    /// The run moved to a moment, s from its start (the scrubber).
    func scrub(to t: Double) {
        flownS = min(max(0, t), totalS)
        place()
    }

    private func tick() {
        ticking?.cancel()
        ticking = Task { [weak self] in
            while let self, !Task.isCancelled, self.running {
                // Under Reduce Motion the airplane steps from one nav log
                // row to the next every two seconds, rather than gliding
                // (docs/design/ios.md §11).
                let stepping = UIAccessibility.isReduceMotionEnabled
                try? await Task.sleep(for: .milliseconds(stepping ? 2000 : 500))
                self.flownS = stepping ? Self.nextStop(after: self.flownS, rowT: self.rowT, total: self.totalS)
                    : min(self.totalS, self.flownS + 0.5 * self.speed)
                self.place()
                if self.done { self.running = false }
            }
        }
    }

    /// The next nav log row's time after `t`, else the run's end.
    static func nextStop(after t: Double, rowT: [Double], total: Double) -> Double {
        min(total, rowT.first { $0 > t + 0.5 } ?? total)
    }

    /// Where the airplane is `flownS` into the flight, between the run's
    /// reports either side: its height in proportion, its track and speed
    /// the earlier report's.
    private func place() {
        guard let at = Replay.position(points, at: min(flownS, totalS)) else { return }
        fix = OwnShip.Fix(coordinate: at.coordinate, altitudeFt: at.altFt, trackDeg: at.trackDeg, groundspeedKt: at.gsKt, accuracyM: 0, at: Date())
    }

    // MARK: - The run, the engine's

    /// A row of the nav log as the web app's navLogRows lays it out and the
    /// engine reads it: the departure, each hop's checkpoints, the stop it
    /// lands at, the destination, each after the departure with the leg
    /// arriving at it; and where a climb tops out or a descent starts on a
    /// leg, a row of its own before it, each row with the piece of the leg
    /// that arrives there (`part`).
    struct Row: Encodable {
        let kind: String
        var airport: CourseEnd?
        var cp: Checkpoint?
        var point: Turn?
        var leg: Leg?
        var part: Leg?
    }

    /// A top of climb or descent as the engine reads a row's point.
    struct Turn: Encodable {
        let alongNm: Double
        let altitudeFt: Double
        let lat: Double
        let lon: Double
        var toFt: Double?
        var pattern: Bool?
    }

    /// The rows for the legs the nav log has, as BriefLegs lays them out;
    /// nil where they do not make one row a leg.
    static func rows(course: Course, checkpoints: [Checkpoint], legs: [Leg]) -> [Row]? {
        let stops = course.stops ?? []
        var ends: [Row] = []
        for hop in 0...stops.count {
            ends += checkpoints.filter { ($0.hop ?? 0) == hop }.map { Row(kind: "checkpoint", cp: $0) }
            if hop < stops.count { ends.append(Row(kind: "stop", airport: stops[hop])) }
        }
        ends.append(Row(kind: "destination", airport: course.destination))
        guard !legs.isEmpty, ends.count == legs.count else { return nil }
        var rows = [Row(kind: "departure", airport: course.departure)]
        for (end, leg) in zip(ends, legs) {
            let (turns, part) = arriving(leg)
            rows += turns
            var row = end
            row.leg = leg
            row.part = part
            rows.append(row)
        }
        return rows
    }

    /// A leg's tops of climb and descent as rows, in the order flown, each
    /// with the piece of the leg up to it -- up to a top of climb at the
    /// climb's own speeds -- and the piece that arrives at the row the leg
    /// ends at (navLogRows' arriving). A point the plan gave no place or
    /// time for is left out, as a plan kept from before they were read has
    /// none.
    static func arriving(_ leg: Leg) -> (turns: [Row], part: Leg?) {
        typealias On = (kind: String, turn: Turn, eteMin: Double, fuelGal: Double?, tasKt: Double?, groundspeedKt: Double?)
        var on: [On] = []
        if let t = leg.toc {
            on.append(("toc", Turn(alongNm: t.alongNm, altitudeFt: t.altitudeFt, lat: t.lat, lon: t.lon), t.eteMin, t.fuelGal, t.tasKt, t.groundspeedKt))
        }
        if let t = leg.tod {
            on.append(("tod", Turn(alongNm: t.alongNm, altitudeFt: t.altitudeFt, lat: t.lat, lon: t.lon, toFt: t.toFt, pattern: t.pattern),
                       t.eteMin, t.fuelGal, nil, nil))
        }
        guard !on.isEmpty else { return ([], nil) }
        var turns: [Row] = []
        var from = (nm: 0.0, min: 0.0, gal: 0.0)
        for o in on.sorted(by: { $0.turn.alongNm < $1.turn.alongNm }) {
            var part = piece(leg, from: from, to: (o.turn.alongNm, o.eteMin, o.fuelGal))
            if o.kind == "toc" {
                if let tas = o.tasKt { part.tasKt = tas }
                part.groundspeedKt = o.groundspeedKt
            }
            turns.append(Row(kind: o.kind, point: o.turn, leg: leg, part: part))
            from = (o.turn.alongNm, o.eteMin, o.fuelGal ?? 0)
        }
        return (turns, piece(leg, from: from, to: (leg.distanceNm, leg.eteMin, leg.fuelGal)))
    }

    /// The piece of `leg` from one point on it to the next: the miles,
    /// minutes and fuel between them.
    private static func piece(_ leg: Leg, from: (nm: Double, min: Double, gal: Double), to: (nm: Double, min: Double?, gal: Double?)) -> Leg {
        var part = leg
        part.distanceNm = max(0, to.nm - from.nm)
        part.eteMin = to.min.map { max(0, $0 - from.min) }
        part.fuelGal = to.gal.map { max(0, $0 - from.gal) }
        return part
    }

    /// The engine's run of the plan from 0 s, as a replay's reports. Its
    /// heights only where the plan's climb is in the rows: with no top of
    /// climb (a plan kept from before they were read) the profile would
    /// hold the field's elevation the whole way, and traffic would be
    /// labelled against that, so the height is left unknown, as the old
    /// run left it.
    /// Nil where the rows do not make one a leg; thrown where the engine
    /// refuses them, which the dry run says (DryRun.problem).
    static func run(course: Course, checkpoints: [Checkpoint], legs: [Leg]) throws -> [Replay.Point]? {
        try flight(course: course, checkpoints: checkpoints, legs: legs)?.points
    }

    /// The run as flown: its reports, when it reaches each row and where
    /// it lands, each from 0 s.
    struct Flown {
        let points: [Replay.Point]
        let rowT: [Double]
        let landings: [EngineContract.DryRunAnswerLandingsItem]
    }

    static func flight(course: Course, checkpoints: [Checkpoint], legs: [Leg]) throws -> Flown? {
        guard let rows = rows(course: course, checkpoints: checkpoints, legs: legs) else { return nil }
        // The rows carry the planner's own models (a leg, a checkpoint), in
        // its snake case, which the contract leaves open: written so, and
        // read again as the contract's rows.
        let asked: [EngineContract.NavLogRow] = try Engine.recoded(rows, encoder: Planner.snakeEncoder)
        let answer = try Engine.dryRun(rows: asked, startS: 0, line: course.courseLine.map { $0.map(OpenAPIValueContainer.init(number:)) })
        let heights = rows.contains { $0.kind == "toc" }
        let points = answer.points.map {
            Replay.Point(t: $0.t, lat: $0.lat, lon: $0.lon, altFt: heights ? $0.altFt : nil, gsKt: $0.gsKt, trackDeg: $0.trackDeg)
        }
        return Flown(points: points, rowT: answer.rowT, landings: answer.landings)
    }
}
