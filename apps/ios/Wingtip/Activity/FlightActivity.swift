#if canImport(ActivityKit)
import ActivityKit
import Foundation
import WidgetKit

/// The flight in progress on the Lock Screen and in the Dynamic Island
/// (a Live Activity, FlightActivityAttributes; the owner's ask of
/// 2026-11-03, as Apple recommends for anything ongoing): the next fix and
/// the time to it, the arrival, the fuel the plan expects left, the
/// frequency ATC last gave and the copilot's message. It starts as a
/// flight begins -- the dry run's start, or own ship at flying speed with
/// a route planned -- or when the pilot starts it (the Control Center
/// control, Siri); it follows the app's in-flight models (InFlight,
/// Copilot, AtcCopilot: FlightActivityContent), and it ends five minutes
/// after the airplane has landed, or when the pilot stops it.
@MainActor
final class FlightActivity {
    static let shared = FlightActivity()

    /// How long own ship stays under flying speed before the flight is over.
    static let landedAfter: TimeInterval = 5 * 60
    /// The least time between two updates of the figures alone.
    static let updateEvery: TimeInterval = 30
    /// How long a shown state stays current before the system dims it.
    static let staleAfter: TimeInterval = 2 * 60

    private var activity: Activity<FlightActivityAttributes>?
    private var last: FlightActivityAttributes.ContentState?
    /// When the airplane was last seen flying, to end after a landing.
    private var lastFlying: Date?
    /// Stopped by the pilot in the air: not started again until the
    /// airplane is back on the ground.
    private var stoppedByPilot = false
    /// Why the activity could not be started, where it could not.
    private(set) var problem: String?

    var running: Bool { activity != nil }

    private init() {
        // An activity the control started while the app was not running
        // (FlightControlIntent) is taken up rather than started twice.
        activity = Activity<FlightActivityAttributes>.activities.first
    }

    // MARK: - Started and stopped

    /// Starts the activity for a route, where the phone allows Live
    /// Activities and none is running.
    @discardableResult
    func start(dep: String, dest: String, tail: String?, state: FlightActivityAttributes.ContentState) -> Bool {
        guard activity == nil, !dep.isEmpty, !dest.isEmpty else { return activity != nil }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            problem = "Live Activities are off for Wingtip Maps in Settings."
            return false
        }
        do {
            activity = try Activity.request(
                attributes: FlightActivityAttributes(dep: dep, dest: dest, tail: tail),
                content: ActivityContent(state: state, staleDate: state.updatedAt.addingTimeInterval(Self.staleAfter)),
                pushType: nil)
            last = state
            problem = nil
            stoppedByPilot = false
            told()
            return true
        } catch {
            problem = error.localizedDescription
            return false
        }
    }

    /// The pilot's own start (the control, Siri), from the route kept on
    /// the phone, which is there with the app not yet open (Kept).
    @discardableResult
    func startByPilot(kept: Kept? = Kept.load(), now: Date = Date()) -> Bool {
        guard let kept, !kept.dep.isEmpty, !kept.dest.isEmpty else {
            problem = "Plan a route first, then start the flight."
            return false
        }
        let inputs = FlightActivityContent.Inputs(
            progress: nil, routeNm: kept.course?.distanceNm ?? kept.legs.reduce(0) { $0 + $1.distanceNm },
            airplaneChosen: kept.aircraft != Plan.noAirplane, usableFuelGal: kept.totals?.usableFuelGal,
            frequency: nil, copilot: nil, now: now)
        return start(dep: kept.dep, dest: kept.dest, tail: kept.tail, state: FlightActivityContent.state(inputs))
    }

    /// The pilot's own stop: ended now, and not started again in this
    /// flight.
    func stopByPilot() {
        if lastFlying != nil { stoppedByPilot = true }
        end()
    }

    /// Ends the activity, leaving its last figures on the Lock Screen for
    /// the system's default while.
    func end() {
        guard let activity else { return }
        self.activity = nil
        last = nil
        lastFlying = nil
        told()
        // By its id, so the activity itself is not sent across to the task.
        let id = activity.id
        Task {
            guard let running = Self.activity(id) else { return }
            await running.end(running.content, dismissalPolicy: .default)
        }
    }

    /// The control's state kept in the App Group and the control drawn
    /// again, so Control Center shows whether a flight is running.
    private func told() {
    }

    // MARK: - Followed

    /// Watches a flight: the dry run's, or own ship's with a route planned.
    /// Called every few seconds from the app (WingtipApp); it starts,
    /// updates and ends the activity as the flight goes.
    func observe(plan: Plan, dryRun: DryRun, ownShip: OwnShip, now: Date = Date()) {
        // The rehearsal on the ground counts as a flight on the Lock
        // Screen: that is what it is for. Own ship's flying speed is the
        // engine's (`underway`, InFlight).
        let rehearsing = dryRun.running || (dryRun.fix != nil && !dryRun.done)
        let flying = rehearsing || (ownShip.fix != nil && plan.routed && InFlight.shared.underway)
        if dryRun.done, dryRun.fix != nil, activity != nil, lastFlying != nil {
            end()
            return
        }
        let state = FlightActivityContent.state(Self.inputs(plan: plan, now: now))
        if flying {
            lastFlying = now
            if activity == nil, !stoppedByPilot, plan.routed {
                start(dep: plan.dep, dest: plan.dest, tail: plan.tail, state: state)
            }
        } else {
            stoppedByPilot = false
            // Landed and at rest for a while: the flight is over. One the
            // pilot started on the ground stays until it has flown.
            if activity != nil, let flew = lastFlying, now.timeIntervalSince(flew) >= Self.landedAfter {
                end()
                return
            }
        }
        update(state)
    }

    /// The app's in-flight models as they stand, for the content.
    static func inputs(plan: Plan, now: Date) -> FlightActivityContent.Inputs {
        FlightActivityContent.Inputs(
            progress: InFlight.shared.progress,
            routeNm: plan.course?.distanceNm ?? plan.legs.reduce(0) { $0 + $1.distanceNm },
            airplaneChosen: plan.airplaneChosen, usableFuelGal: plan.totals?.usableFuelGal,
            frequency: FlightActivityContent.frequency(in: AtcCopilot.shared.cards),
            copilot: Copilot.shared.mode == .off ? nil : Copilot.shared.message,
            now: now)
    }

    /// The state sent where it is due (FlightActivityContent.due).
    private func update(_ state: FlightActivityAttributes.ContentState) {
        guard let activity, FlightActivityContent.due(state, after: last, every: Self.updateEvery) else { return }
        last = state
        let id = activity.id
        Task {
            await Self.activity(id)?.update(ActivityContent(state: state, staleDate: state.updatedAt.addingTimeInterval(Self.staleAfter)))
        }
    }

    private static func activity(_ id: String) -> Activity<FlightActivityAttributes>? {
        Activity<FlightActivityAttributes>.activities.first { $0.id == id }
    }
}
#endif
