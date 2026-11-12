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
/// Copilot, AtcCopilot: FlightActivityContent), in Flighty's phases --
/// ready on the ground, airborne, arrived -- and five minutes after the
/// airplane has come to rest it ends with its landing and block time,
/// left up for twenty more, or when the pilot stops it.
@MainActor
final class FlightActivity {
    static let shared = FlightActivity()

    /// How long own ship stays under flying speed before the flight is over.
    static let landedAfter: TimeInterval = 5 * 60
    /// The least time between two updates of the figures alone.
    static let updateEvery: TimeInterval = 30
    /// How long a shown state stays current before the system dims it.
    nonisolated static let staleAfter: TimeInterval = 2 * 60

    private var activity: Activity<FlightActivityAttributes>?
    private var last: FlightActivityAttributes.ContentState?
    /// When the airplane was last seen flying, to end after a landing.
    private var lastFlying: Date?
    /// Stopped by the pilot in the air: not started again until the
    /// airplane is back on the ground.
    private var stoppedByPilot = false
    /// When the activity started, for the block time once landed.
    private var startedAt: Date?
    /// How long the arrived phase stays on the Lock Screen once the
    /// airplane is at rest: "15 to 30 minutes is adequate" (HIG Live
    /// Activities).
    static let arrivedFor: TimeInterval = 20 * 60
    /// Why the activity could not be started, where it could not.
    private(set) var problem: String?

    var running: Bool { activity != nil }

    private init() {
        // An activity the control started while the app was not running
        // (FlightControlIntent) is taken up rather than started twice.
        activity = Activity<FlightActivityAttributes>.activities.first
        // The control shows what is so, should iOS have ended one meanwhile.
        FlightControlState.write(running: activity != nil)
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
            startedAt = state.updatedAt
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
            frequency: nil, copilot: nil, now: now, phase: .ready,
            depCategory: kept.briefing?.metars.additionalProperties[kept.dep]??.flightCategory, plannedEteMin: kept.totals?.eteMin)
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
        end(final: nil, dismissAt: nil)
    }

    /// Ends the activity, with a last state to leave up (the arrived
    /// phase) until `dismissAt`, or as it stands for the system's while.
    private func end(final: FlightActivityAttributes.ContentState?, dismissAt: Date?) {
        guard let activity else { return }
        self.activity = nil
        last = nil
        lastFlying = nil
        startedAt = nil
        told()
        // By its id, found again off the main actor, so the activity
        // itself is never sent across to the task.
        let id = activity.id
        Task { await Self.finish(id, final: final, dismissAt: dismissAt) }
    }

    /// The control's state kept in the App Group and the control drawn
    /// again, so Control Center shows whether a flight is running.
    private func told() {
        FlightControlState.write(running: running)
        ControlCenter.shared.reloadControls(ofKind: FlightControlState.kind)
    }

    // MARK: - Followed

    /// Watches a flight: the dry run's, or own ship's with a route planned.
    /// Called every few seconds from the app (WingtipApp); it starts,
    /// updates and ends the activity as the flight goes.
    func observe(plan: Plan, dryRun: DryRun, ownShip: OwnShip, inFlight: InFlight, copilot: Copilot, atc: AtcCopilot, now: Date = Date()) {
        // The rehearsal on the ground counts as a flight on the Lock
        // Screen: that is what it is for. Own ship's flying speed is the
        // engine's (`underway`, InFlight).
        let rehearsing = dryRun.running || (dryRun.fix != nil && !dryRun.done)
        let flying = rehearsing || (ownShip.fix != nil && plan.routed && inFlight.underway)
        if dryRun.done, dryRun.fix != nil, activity != nil, lastFlying != nil {
            end()
            return
        }
        var inputs = Self.inputs(plan: plan, progress: inFlight.progress, copilot: copilot, atc: atc, now: now)
        inputs.startedAt = startedAt
        // On the ground after flying, still the flight until it is over.
        inputs.phase = flying || lastFlying != nil ? .airborne : .ready
        let state = FlightActivityContent.state(inputs)
        if flying {
            lastFlying = now
            if activity == nil, !stoppedByPilot, plan.routed {
                start(dep: plan.dep, dest: plan.dest, tail: plan.tail, state: state)
            }
        } else {
            stoppedByPilot = false
            // Landed and at rest for a while: the flight is over, its
            // landing and block time left up for a while (Flighty's arrived
            // phase). One the pilot started on the ground stays until it
            // has flown.
            if activity != nil, let flew = lastFlying, now.timeIntervalSince(flew) >= Self.landedAfter {
                inputs.phase = .arrived
                inputs.landedAt = flew
                end(final: FlightActivityContent.state(inputs), dismissAt: flew.addingTimeInterval(Self.arrivedFor))
                return
            }
        }
        update(state)
    }

    /// The app's in-flight models as they stand, for the content.
    static func inputs(plan: Plan, progress: InFlight.Progress?, copilot: Copilot, atc: AtcCopilot, now: Date) -> FlightActivityContent.Inputs {
        FlightActivityContent.Inputs(
            progress: progress,
            routeNm: plan.course?.distanceNm ?? plan.legs.reduce(0) { $0 + $1.distanceNm },
            airplaneChosen: plan.airplaneChosen, usableFuelGal: plan.totals?.usableFuelGal,
            frequency: FlightActivityContent.frequency(in: atc.cards),
            copilot: copilot.mode == .off ? nil : copilot.message,
            weather: WeatherWatch.shared.latest,
            now: now,
            depCategory: plan.briefing?.metars.additionalProperties[plan.dep]??.flightCategory,
            plannedEteMin: plan.totals?.eteMin)
    }

    /// The route's weather gone worse, on the Lock Screen at once where a
    /// flight is shown there (WeatherWatch); the next state carries it on.
    func weather(_ line: String, now: Date = Date()) {
        guard activity != nil, var state = last else { return }
        state.weather = line
        state.updatedAt = now
        update(state)
    }

    /// The state sent where it is due (FlightActivityContent.due).
    private func update(_ state: FlightActivityAttributes.ContentState) {
        guard let activity, FlightActivityContent.due(state, after: last, every: Self.updateEvery) else { return }
        last = state
        let id = activity.id
        Task { await Self.send(state, to: id) }
    }

    private nonisolated static func finish(_ id: String, final: FlightActivityAttributes.ContentState?, dismissAt: Date?) async {
        guard let found = Activity<FlightActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
        let content = final.map { ActivityContent(state: $0, staleDate: nil) } ?? found.content
        await found.end(content, dismissalPolicy: dismissAt.map { .after($0) } ?? .default)
    }

    private nonisolated static func send(_ state: FlightActivityAttributes.ContentState, to id: String) async {
        guard let found = Activity<FlightActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
        await found.update(ActivityContent(state: state, staleDate: state.updatedAt.addingTimeInterval(staleAfter)))
    }
}
#endif
