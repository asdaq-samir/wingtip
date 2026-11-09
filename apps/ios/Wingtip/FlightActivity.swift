#if canImport(ActivityKit)
import ActivityKit
import CoreLocation
import Foundation

/// The flight in progress on the Lock Screen and in the Dynamic Island
/// (a Live Activity, FlightActivityAttributes; the owner's ask of
/// 2026-11-03, as Apple recommends for anything ongoing). Started as a
/// flight begins -- the dry run's start, or own ship underway with a
/// route planned -- updated from each fix no more than every 30 s or as
/// the next checkpoint changes, and ended as the flight ends. The figures
/// are the plan's counted down from where the airplane is: planning data,
/// not a gauge, as the nav log's are.
@MainActor
final class FlightActivity {
    static let shared = FlightActivity()

    /// How long own ship stays under that before the flight is over.
    static let landedAfter: TimeInterval = 5 * 60
    /// The least time between two updates: the Lock Screen is read at a
    /// glance, and ActivityKit limits how often an activity may change.
    static let updateEvery: TimeInterval = 30
    /// How long a shown state stays current before the system dims it.
    static let staleAfter: TimeInterval = 2 * 60

    private var activity: Activity<FlightActivityAttributes>?
    private var lastUpdate: Date = .distantPast
    private var lastCheckpoint: String?
    /// When the flight began, for the planned burn so far.
    private var startedAt: Date?
    /// When own ship was last seen flying, to end the activity after a
    /// landing.
    private var lastFlying: Date?
    /// Why the activity could not be started, where it could not.
    private(set) var problem: String?

    var running: Bool { activity != nil }

    /// Starts the activity for the plan's route, where the phone allows
    /// Live Activities and none is running.
    func start(plan: Plan) {
        guard activity == nil, plan.routed else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            problem = "Live Activities are off for Wingtip Maps in Settings."
            return
        }
        let attributes = FlightActivityAttributes(dep: plan.dep, dest: plan.dest, tail: plan.tail)
        let state = Self.state(plan: plan, fix: nil, startedAt: Date(), now: Date())
        do {
            activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(Self.staleAfter)),
                pushType: nil
            )
            startedAt = Date()
            lastUpdate = Date()
            lastCheckpoint = state.nextCheckpoint
            problem = nil
        } catch {
            problem = error.localizedDescription
        }
    }

    /// The activity brought up to the fix, no more than every 30 s or
    /// as the next checkpoint changes.
    func update(from fix: OwnShip.Fix, plan: Plan) {
        guard let activity else { return }
        let now = Date()
        let state = Self.state(plan: plan, fix: fix, startedAt: startedAt ?? now, now: now)
        let checkpointChanged = state.nextCheckpoint != lastCheckpoint
        guard checkpointChanged || now.timeIntervalSince(lastUpdate) >= Self.updateEvery else { return }
        lastUpdate = now
        lastCheckpoint = state.nextCheckpoint
        Task {
            await activity.update(ActivityContent(state: state, staleDate: now.addingTimeInterval(Self.staleAfter)))
        }
    }

    /// Ends the activity, leaving its last figures on the Lock Screen for
    /// the system's default while.
    func end() {
        guard let activity else { return }
        self.activity = nil
        startedAt = nil
        lastFlying = nil
        lastCheckpoint = nil
        Task {
            let last = activity.content
            await activity.end(last, dismissalPolicy: .default)
        }
    }

    /// Watches a flight: the dry run's, or own ship's with a route planned.
    /// Called every few seconds from the app (WingtipApp); it starts,
    /// updates and ends the activity as the flight goes.
    func observe(plan: Plan, dryRun: DryRun, ownShip: OwnShip) {
        let now = Date()
        if dryRun.running || (dryRun.fix != nil && !dryRun.done) {
            // The rehearsal on the ground counts as a flight on the Lock
            // Screen: that is what it is for.
            if activity == nil { start(plan: plan) }
            if let fix = dryRun.fix { update(from: fix, plan: plan) }
            lastFlying = now
            return
        }
        if dryRun.done && activity != nil && startedAt != nil && dryRun.fix != nil {
            end()
            return
        }
        guard let fix = ownShip.fix, plan.routed else {
            if activity != nil, let last = lastFlying, now.timeIntervalSince(last) >= Self.landedAfter { end() }
            return
        }
        let flying: Bool
        do { flying = try Flight.underway(fix.groundspeedKt) } catch {
            // Neither started nor ended on a guess; the reason is shown.
            problem = "Couldn't tell whether you are flying: \(error.localizedDescription)"
            return
        }
        if flying {
            lastFlying = now
            if activity == nil { start(plan: plan) }
            update(from: fix, plan: plan)
        } else if activity != nil, let last = lastFlying, now.timeIntervalSince(last) >= Self.landedAfter {
            end()
        }
    }

    // MARK: - The figures

    /// The content state from the plan and the fix. With no fix (the
    /// start), the whole course lies ahead at the planned time.
    static func state(plan: Plan, fix: OwnShip.Fix?, startedAt: Date, now: Date) -> FlightActivityAttributes.ContentState {
        let totalNm = plan.course?.distanceNm ?? plan.legs.reduce(0) { $0 + $1.distanceNm }
        let plannedMin = plan.totals?.eteMin ?? 0
        // Where the airplane is along the course, and the leg it is on: the
        // engine's route_position, as the strip asks it.
        // A Live Activity has no room for an error: where the engine
        // refuses (logged by Engine.rule), the Lock Screen shows the plan's
        // figures from the start, as it does before the first fix.
        let at = fix.flatMap { fix in plan.course.flatMap { try? Flight.position(fix.coordinate, line: $0.coordinates, legs: plan.legs) } }
        let alongNm = min(totalNm, at?.alongNm ?? 0)
        let toGoNm = max(0, totalNm - alongNm)
        let next = plan.checkpoints.first { $0.alongTrackNm > alongNm + 0.25 }
        let leg: Leg? = at.flatMap { plan.legs.indices.contains(Int($0.leg)) ? plan.legs[Int($0.leg)] : nil } ?? plan.legs.first
        let gs = fix?.groundspeedKt
        // Minutes to the destination at the speed being made good; on the
        // ground, or with no fix yet, the plan's time for what is left.
        let etaMinutes: Double = {
            if let gs, (try? Flight.underway(gs)) == true { return toGoNm / gs * 60 }
            guard totalNm > 0, plannedMin > 0 else { return 0 }
            return plannedMin * (toGoNm / totalNm)
        }()
        // The fuel the plan expects left: the usable fuel less the planned
        // burn for the time flown, at the plan's average rate (its fuel for
        // its time) -- planning data, as the nav log's fuel column is, not
        // the airplane's gauge (14 CFR 91.151's reserve is the planner's to
        // check, not this display's).
        let fuelRemainingGal: Double? = {
            guard let totals = plan.totals, let usable = totals.usableFuelGal, let fuel = totals.fuelGal, plannedMin > 0 else { return nil }
            let flownMin = max(0, now.timeIntervalSince(startedAt) / 60)
            return max(0, usable - fuel / plannedMin * flownMin)
        }()
        return FlightActivityAttributes.ContentState(
            nextCheckpoint: next?.name ?? next?.id,
            toGoNm: toGoNm, etaMinutes: etaMinutes, fuelRemainingGal: fuelRemainingGal,
            groundSpeedKt: gs, altitudeFt: fix?.altitudeFt,
            legFrom: leg?.from, legTo: leg?.to, updatedAt: now
        )
    }
}
#endif
