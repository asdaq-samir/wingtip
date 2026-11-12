import Foundation
import Observation
import UIKit

/// The route being planned and what the planner has said of it so far:
/// the course as soon as its ends are found, then the nav log's lines as
/// they stream. The log before a re-plan stays on the page until the new
/// one is whole, as the web app keeps it (usePlan), so the pilot is never
/// looking at a blank list.
@MainActor
@Observable
final class Plan {
    var dep = ""
    var dest = ""
    var stops: [String] = []
    /// The planner's aircraft profile, or `noAirplane` until the pilot
    /// picks one: then the planner gives the route's own figures and none
    /// that needs an airplane (docs/decisions/0011, the web's NO_AIRPLANE).
    var aircraft = Plan.noAirplane
    /// The airplane by its N-number, where one is picked: its type's
    /// profile is `aircraft`, and the pilot's own figures for it, where
    /// set on the gateway, are flown over the type's.
    var tail: String?
    var figures = Figures()
    /// An altitude of the pilot's own, feet MSL; nil for the planner's
    /// pick, with its warnings said where one is over a limit.
    var ownAltitudeFt: Double?
    /// An own altitude picked off the wheel, one of the planner's legal
    /// ones: flown at each leg's nearest legal altitude.
    var ownAltitudeLegal = false
    /// One of the four plans picked by name; nil for the planner's own.
    var altitudeChoice: String?
    /// The procedures picked for the route's fields, one per field and
    /// kind: a departure out of the departure, an arrival or an approach
    /// into a stop or the destination.
    var procedures: [ProcedurePick] = []
    /// The pilot's own edits of the route beyond its points: altitudes
    /// at points, holds, crossings and a Direct to (RouteEdits).
    var extras = RouteExtras()

    private(set) var course: Course?
    private(set) var checkpoints: [Checkpoint] = []
    private(set) var profile: RouteProfile?
    private(set) var altitude: NavLogAltitude?
    private(set) var briefing: Briefing?
    private(set) var routes: RouteOptions?
    private(set) var routesProblem: String?
    /// The route's stops as the pilot typed them, kept while one of the
    /// planner's ways is flown in their place: "None" on the route line
    /// flies them again.
    private(set) var typedStops: [String] = []
    /// The planner's way flown in place of the typed route, picked on the
    /// route line; nil for the route as typed.
    private(set) var pickedChip: RouteChip?
    /// The route the ways in `routes` were asked for, so a re-plan of the
    /// same route (a new altitude, a procedure) does not ask again.
    private var routesAskedFor: String?
    private(set) var briefingProblem: String?
    /// What the plan's side fetches could not get, said where each shows
    /// (the nav log's checkpoints, the profile's ground), never taken for
    /// a route with none.
    private(set) var sideProblems: [SideFetch: String] = [:]
    enum SideFetch { case checkpoints, profile }
    /// When the briefing on the page was fetched, for ready_to_fly's age.
    private(set) var briefedAt: Date?
    /// The legs a hazard tapped in the Brief is on, shown on the map
    /// (BriefLegs.swift); nil when none is.
    var hazardLegs: HazardLegs?
    private(set) var legs: [Leg] = []
    private(set) var altitudeFt: Double?
    private(set) var totals: Totals?
    private(set) var stage: String?
    private(set) var problem: NavLogError?
    private(set) var planning = false
    private var running: Task<Void, Never>?
    /// The route before a Direct to or diversion still being planned
    /// (RouteEdits), put back where the planner can't be reached, and why.
    @ObservationIgnored var directFrom: RouteState?
    private(set) var directProblem: String?
    /// Why a share or a saved file from the route's Share menu sent nothing,
    /// said under the route where the menu is (ShareMenu); nil once one goes.
    var shareProblem: String?

    /// When the plan shown was made; nil while it is being made now.
    private(set) var plannedAt: Date?

    /// The route as last taken in (remember): what an Undo puts back.
    @ObservationIgnored private var lastState = RouteState()
    /// The window's, from SwiftUI's environment (RootView): shake to undo,
    /// the Edit menu's Undo and Redo and the bar's Undo (UndoToolbarItem).
    @ObservationIgnored weak var undoManager: UndoManager?
    /// Off while a kept plan is put back at launch: that is not the
    /// pilot's change to undo.
    @ObservationIgnored private var remembering = true

    var routed: Bool { !dep.isEmpty && !dest.isEmpty }

    /// What is on the page, kept for the air (Kept): after the nav log
    /// is whole, and as the briefing, checkpoints and side view come. And
    /// the route itself in the plan history the pilot's devices share
    /// (PlannedRoute).
    func keep() {
        guard routed, course != nil, totals != nil else { return }
        Kept(dep: dep, dest: dest, stops: stops, aircraft: aircraft, tail: tail, ownAltitudeFt: ownAltitudeFt, altitudeChoice: altitudeChoice,
             course: course, checkpoints: checkpoints, profile: profile, altitude: altitude, legs: legs, totals: totals,
             briefing: briefing, briefedAt: briefedAt, plannedAt: plannedAt ?? Date()).save()
        PlanHistory.planned(routeState, at: plannedAt ?? Date())
    }

    /// The last plan kept, back on the page at launch: planned again when
    /// the planner answers, kept as it was when it does not. The file
    /// holds the whole briefing, so it is read and decoded off the main
    /// actor, where it held up the launch's first frames; a route the
    /// pilot began meanwhile is not overwritten.
    func restore() async {
        // A UI test launched with -fresh starts with no route, whatever
        // the simulator kept from the last run (WingtipUITests).
        guard !CommandLine.arguments.contains("-fresh") else { return }
        guard let kept = await Task.detached(priority: .userInitiated, operation: { Kept.load() }).value,
              dep.isEmpty, dest.isEmpty, stops.isEmpty else { return }
        dep = kept.dep; dest = kept.dest; stops = kept.stops
        (aircraft, tail) = Self.airplane(kept: kept)
        figures = OwnFigureStore.load(OwnFigureStore.name(tail: tail, aircraft: aircraft))
        ownAltitudeFt = kept.ownAltitudeFt; altitudeChoice = kept.altitudeChoice
        course = kept.course; checkpoints = kept.checkpoints; profile = kept.profile; altitude = kept.altitude
        legs = kept.legs; totals = kept.totals; altitudeFt = kept.altitude?.altitudeFt; briefing = kept.briefing; briefedAt = kept.briefedAt
        plannedAt = kept.plannedAt
        // Said with their age until the planner answers again (brief and
        // plan clear it), so a briefing kept from yesterday never reads as
        // today's after a relaunch with no signal.
        noteKept(kept.briefedAt, .briefing, .weather)
        noteKept(kept.plannedAt, .plan)
        remembering = false
        plan()
        remembering = true
        lastState = routeState
    }

    /// The route's idents in order, as the route box shows them.
    var idents: [String] { [dep] + stops + [dest] }

    /// The route cleared at once, no question asked: the bar's Undo, shake
    /// or the Edit menu brings it back (PlanHistory).
    func clear() {
        dep = ""; dest = ""; stops = []
        ownAltitudeFt = nil; ownAltitudeLegal = false; altitudeChoice = nil; procedures = []
        extras = RouteExtras()
        typedStops = []; pickedChip = nil; routes = nil; routesProblem = nil; routesAskedFor = nil
        forgetPlanned()
        remember()
    }

    /// What the planner said of the route, gone with it.
    private func forgetPlanned() {
        running?.cancel()
        course = nil; checkpoints = []; profile = nil; altitude = nil; briefing = nil; briefedAt = nil; briefingProblem = nil; hazardLegs = nil
        legs = []; totals = nil; altitudeFt = nil; stage = nil; problem = nil; planning = false; plannedAt = nil
        Kept.forget()
    }

    /// The route as it is now taken in: a change is a step the window's
    /// UndoManager can take back, holding the route as it was, named for
    /// what it took away ("Undo Route cleared") and said to VoiceOver
    /// where it took something. An Undo puts the route back (put), which
    /// comes through here again inside the UndoManager's undo, so the
    /// step it registers is the Redo, as the system does it.
    private func remember() {
        guard remembering else { return }
        let next = routeState, before = lastState
        guard next != before else { return }
        lastState = next
        let note = PlanHistory.note(from: before, to: next)
        if let note, undoManager?.isUndoing != true, undoManager?.isRedoing != true {
            UIAccessibility.post(notification: .announcement, argument: note)
        }
        guard let undoManager else { return }
        undoManager.levelsOfUndo = PlanHistory.limit
        undoManager.register(self, named: note ?? "Route Change") { $0.put(before) }
    }

    /// The route as it was set: planned again, or forgotten where it is
    /// not a route, and taken in as the step to go back over.
    private func put(_ state: RouteState) {
        dep = state.dep; dest = state.dest; stops = state.stops; procedures = state.procedures; extras = state.extras
        ownAltitudeFt = state.ownAltitudeFt; ownAltitudeLegal = state.ownAltitudeLegal; altitudeChoice = state.altitudeChoice
        if routed { plan() } else { forgetPlanned() }
        remember()
    }

    /// No steps back: a signed-out pilot's routes are not the next one's.
    func forgetHistory() {
        lastState = routeState
        undoManager?.forget(self)
    }

    /// The plan's own kept answers (Kept) shown, from `at`, or fresh again
    /// (nil): said on the Brief and the nav log by KeptAgeLine.
    private func noteKept(_ at: Date?, _ kinds: KeptForAir.Kind...) {
        for kind in kinds { KeptShown.shared.note(kind, key: idents.joined(separator: " "), at: at) }
    }

    /// The route's profile fetched where the plan has none (its side fetch
    /// failed or never ran), and the plan kept with it: Keep for the Air's,
    /// so the profile is there in the air. True where it was kept.
    func keepProfile() async -> Bool {
        guard routed, profile == nil else { return profile != nil }
        guard let ground = try? await Planner.routeProfile(dep: dep, dest: dest, stops: stops) else { return false }
        profile = ground
        sideProblems[.profile] = nil
        keep()
        return true
    }

    /// A Direct to the planner couldn't be asked for: the route as it was
    /// put back, so the route box, the line and the legs are one route's,
    /// never the new route's over the old legs (the offline audit).
    func undoDirect(_ before: RouteState) {
        let ident = extras.direct
        directFrom = nil
        dep = before.dep; dest = before.dest; stops = before.stops; extras = before.extras
        directProblem = "Not changed: no connection. Direct to \(ident ?? "the point") needs the planner; the route is as it was."
        remember()
        noteKept(plannedAt, .plan)
    }

    /// A procedure picked for a field, in place of any of its kind there;
    /// nil takes that kind off the field. Planned again.
    func pick(_ procedure: ProcedurePick?, kind: String, at ident: String) {
        procedures.removeAll { $0.ident == ident && $0.kind == kind }
        if let procedure { procedures.append(procedure) }
        plan()
    }

    /// The ways to fly the route as the pilot typed it, for the route
    /// line's chips: asked for once per route, whichever way is flown.
    private func findRoutes(dep: String, dest: String, stops: [String], aircraft: String?, figures: Figures, asked: String) async {
        do {
            let found = try await Planner.routeOptions(dep: dep, dest: dest, stops: stops, aircraft: aircraft, figures: figures)
            guard routesAskedFor == asked else { return }
            routes = found
        } catch {
            guard routesAskedFor == asked, !(error is CancellationError) else { return }
            routesProblem = error.localizedDescription
            Log.planner.notice("the route options for \(dep, privacy: .public) to \(dest, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// A way off the route line flown at once, no asking first: its stops
    /// the route's, the typed ones kept for "None".
    /// "None" flies the typed stops whatever the chip carries: the typed
    /// route is the pilot's, kept here.
    func use(_ chip: RouteChip) {
        guard chip.key != "none" else { return useTyped() }
        if pickedChip == nil { typedStops = stops }
        pickedChip = chip
        stops = chip.stops
        plan()
    }

    /// "None" on the route line: the route as the pilot typed it again.
    func useTyped() {
        guard pickedChip != nil else { return }
        pickedChip = nil
        stops = typedStops
        plan()
    }

    /// The briefing, as the web app fetches it as soon as the route is known
    /// and again as the nav log gives the flight's time.
    func brief(dep: String, dest: String, stops: [String], eteMin: Double?) async {
        // Its hazards placed on the nav log's legs once they are in.
        let legs = BriefLegs.query(course: course, checkpoints: checkpoints, legs: self.legs)
        do {
            briefing = try await Planner.briefing(dep: dep, dest: dest, stops: stops, eteMin: eteMin, legs: legs)
            briefedAt = Date()
            briefingProblem = nil
            noteKept(nil, .briefing, .weather)
            keep()
        } catch {
            briefingProblem = error.localizedDescription
            // The briefing kept stands, said with its age (KeptAgeLine).
            if briefing != nil, KeptForAir.fallsBack(error) { noteKept(briefedAt, .briefing, .weather) }
            Log.planner.notice("the briefing for \(dep, privacy: .public) to \(dest, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Plans the route as entered: the course first, for the map, then
    /// the nav log streamed in.
    func plan() {
        guard routed else { return }
        running?.cancel()
        let dep = dep.uppercased(), dest = dest.uppercased(), stops = stops.map { $0.uppercased() }, aircraft = plannerAircraft
        let own = ownAltitudeFt, legal = ownAltitudeLegal, choice = altitudeChoice, figures = figures
        let picks = procedures.filter { idents.contains($0.ident) }
        let extra: [String: String?]
        do { extra = try extras.query(procedures: picks) } catch {
            // A hold or a procedure the engine could not write is said, not
            // left out of a route planned without it.
            problem = NavLogError(advice: nil, brief: nil, detail: "Your holds and procedures couldn't be written for the planner: \(error.localizedDescription)", reasons: nil)
            return
        }
        self.dep = dep; self.dest = dest; self.stops = stops
        directFrom = nil; directProblem = nil
        remember()
        // A way picked stands while its stops are the route's; a stop
        // added, taken out or moved makes the route the pilot's own again,
        // and the ways are asked for afresh for it.
        if let chip = pickedChip, chip.stops.map({ $0.uppercased() }) != stops { pickedChip = nil }
        if pickedChip == nil { typedStops = stops }
        let asked = ([dep, dest, aircraft ?? Plan.noAirplane] + typedStops).joined(separator: " ")
        if asked != routesAskedFor {
            routesAskedFor = asked
            routes = nil; routesProblem = nil
            let typed = typedStops
            Task { [weak self] in await self?.findRoutes(dep: dep, dest: dest, stops: typed, aircraft: aircraft, figures: figures, asked: asked) }
        }
        planning = true
        problem = nil
        stage = "Finding the route…"
        running = Task { [weak self] in
            guard let self else { return }
            do {
                let course = try await Planner.course(dep: dep, dest: dest, stops: stops)
                guard !Task.isCancelled else { return }
                if self.course != course { self.hazardLegs = nil }
                self.course = course
                // The checkpoints beside the nav log, not before it: the
                // first read of a new route's chart takes a while, and the
                // log's legs name the same points as they come.
                Task { [weak self] in
                    do {
                        let points = try await Planner.checkpoints(dep: dep, dest: dest, stops: stops)
                        guard !Task.isCancelled else { return }
                        self?.checkpoints = points
                        self?.sideProblems[.checkpoints] = nil
                        self?.keep()
                    } catch {
                        self?.sideProblems[.checkpoints] = "The checkpoints couldn't be fetched: \(error.localizedDescription)"
                    }
                }
                if self.profile == nil || self.profile?.lengthNm != course.distanceNm {
                    Task { [weak self] in
                        do {
                            let ground = try await Planner.routeProfile(dep: dep, dest: dest, stops: stops)
                            guard !Task.isCancelled else { return }
                            self?.profile = ground
                            self?.sideProblems[.profile] = nil
                            self?.keep()
                        } catch {
                            self?.sideProblems[.profile] = "The ground along the route couldn't be fetched: \(error.localizedDescription)"
                        }
                    }
                }
                var fresh: [Leg] = []
                for try await message in try NavLog.stream(dep: dep, dest: dest, stops: stops, aircraft: aircraft, figures: figures, altitudeFt: own, nearest: legal, choice: choice, procedures: picks, extra: extra) {
                    guard !Task.isCancelled else { return }
                    switch message {
                    case .stage(let detail): self.stage = detail
                    case .altitude(let altitude):
                        self.altitude = altitude
                        self.altitudeFt = altitude.altitudeFt
                    case .leg(let leg):
                        fresh.append(leg)
                        // Each leg as it comes, once the first is in: the
                        // old log stands until then.
                        self.legs = fresh
                    case .done(let totals):
                        self.legs = fresh
                        self.totals = totals
                        self.stage = nil
                        self.plannedAt = Date()
                        self.directFrom = nil
                        self.noteKept(nil, .plan)
                        self.keep()
                        // The briefing for the flight's own hours, once
                        // the nav log says how long it takes.
                        Task { [weak self] in await self?.brief(dep: dep, dest: dest, stops: stops, eteMin: totals.eteMin) }
                    case .error(let error):
                        self.problem = error
                        self.stage = nil
                    }
                }
            } catch {
                if !Task.isCancelled {
                    // With no connection the plan kept stands, the planner's
                    // words said with its time; a planner's own refusal is
                    // said as it is.
                    if let before = self.directFrom, error is URLError {
                        self.undoDirect(before)
                    } else if self.legs.isEmpty || !(error is URLError) {
                        self.problem = NavLogError(advice: nil, brief: nil, detail: error.localizedDescription, reasons: nil)
                    } else { self.noteKept(self.plannedAt, .plan) }
                    self.stage = nil
                }
            }
            if !Task.isCancelled { self.planning = false }
        }
    }
}
