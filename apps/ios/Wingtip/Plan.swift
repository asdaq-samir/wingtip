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

    /// When the plan shown was made; nil while it is being made now.
    private(set) var plannedAt: Date?

    /// The route's undo and redo (PlanHistory): each change taken in as
    /// it is planned or cleared, whichever button made it.
    private(set) var history = PlanHistory()
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
    /// the planner answers, kept as it was when it does not.
    func restore() {
        // A UI test launched with -fresh starts with no route, whatever
        // the simulator kept from the last run (WingtipUITests).
        guard !CommandLine.arguments.contains("-fresh"), let kept = Kept.load() else { return }
        dep = kept.dep; dest = kept.dest; stops = kept.stops
        (aircraft, tail) = Self.airplane(kept: kept)
        figures = OwnFigureStore.load(OwnFigureStore.name(tail: tail, aircraft: aircraft))
        ownAltitudeFt = kept.ownAltitudeFt; altitudeChoice = kept.altitudeChoice
        course = kept.course; checkpoints = kept.checkpoints; profile = kept.profile; altitude = kept.altitude
        legs = kept.legs; totals = kept.totals; altitudeFt = kept.altitude?.altitudeFt; briefing = kept.briefing; briefedAt = kept.briefedAt
        plannedAt = kept.plannedAt
        remembering = false
        plan()
        remembering = true
        history = PlanHistory(routeState)
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

    /// The route as it is now taken into the history: a change is a step
    /// to undo with the window's UndoManager, named for what it took away
    /// ("Undo Route Cleared"), and said to VoiceOver where it took
    /// something, as the bar's Undo comes up silently.
    private func remember() {
        guard remembering else { return }
        let (pushed, note) = history.observe(routeState)
        guard pushed else { return }
        if let note { UIAccessibility.post(notification: .announcement, argument: note) }
        undoManager?.register(self, named: note ?? "Route Change") { $0.stepBack(registering: true) }
    }

    /// One step back, the route as it was planned again; the step to redo
    /// handed to the UndoManager when it asked for this one.
    func stepBack(registering: Bool) {
        guard let state = history.undo() else { return }
        put(state)
        if registering { undoManager?.register(self, named: undoManager?.undoActionName ?? "") { $0.stepForward(registering: true) } }
    }

    func stepForward(registering: Bool) {
        guard let state = history.redo() else { return }
        put(state)
        if registering { undoManager?.register(self, named: undoManager?.redoActionName ?? "") { $0.stepBack(registering: true) } }
    }

    private func put(_ state: RouteState) {
        dep = state.dep; dest = state.dest; stops = state.stops; procedures = state.procedures; extras = state.extras
        ownAltitudeFt = state.ownAltitudeFt; ownAltitudeLegal = state.ownAltitudeLegal; altitudeChoice = state.altitudeChoice
        if routed { plan() } else { forgetPlanned() }
    }

    /// No steps back: a signed-out pilot's routes are not the next one's.
    func forgetHistory() {
        history = PlanHistory(routeState)
        undoManager?.forget(self)
    }

    /// The plan's own kept answers (Kept) shown, from `at`, or fresh again
    /// (nil): said on the Brief and the nav log by KeptAgeLine.
    private func noteKept(_ at: Date?, _ kinds: KeptForAir.Kind...) {
        for kind in kinds { KeptShown.shared.note(kind, key: idents.joined(separator: " "), at: at) }
    }

    /// A way round what stops the route put in: the points to fly by,
    /// before the stop they are for.
    func goRound(_ detour: Detour) {
        let points = (detour.via?.isEmpty == false) ? detour.via! : [detour.ident]
        stops.insert(contentsOf: points, at: min(detour.stopIndex, stops.count))
        plan()
    }

    /// The plan as the gateway saves a flight: the route, its altitude,
    /// totals and the legs' points as checkpoints (SaveFlightRequest).
    func saved() -> SaveFlightRequest? {
        guard routed, let course else { return nil }
        var along = 0.0
        let points = legs.enumerated().map { i, leg -> SaveFlightCheckpoint in
            along += leg.distanceNm
            let point = checkpoints.first { ($0.name ?? $0.waypoint ?? "").uppercased() == leg.to.uppercased() }
            return SaveFlightCheckpoint(alongTrackNm: along, altitudeFt: leg.altitudeFt, category: point?.category ?? "point", eteMin: leg.eteMin, fuelGal: leg.fuelGal, groundspeedKt: leg.groundspeedKt, lat: point?.lat ?? course.destination.lat, legDistanceNm: leg.distanceNm, lon: point?.lon ?? course.destination.lon, magneticHeadingDeg: leg.magneticHeadingDeg, name: leg.to, sequenceNo: i + 1, trueCourseDeg: leg.trueCourseDeg)
        }
        return SaveFlightRequest(checkpoints: points, cruiseAltitudeFt: altitudeFt.map { Int($0) }, departureIdent: dep, destinationIdent: dest, stops: stops, totalDistanceNm: totals?.distanceNm, totalEteMin: totals?.eteMin, totalFuelGal: totals?.fuelGal)
    }

    /// A saved flight back on the page: its route, planned again.
    func open(_ flight: SavedFlight) {
        dep = flight.departureIdent; dest = flight.destinationIdent; stops = flight.stops
        ownAltitudeFt = nil; altitudeChoice = nil
        extras = RouteExtras()
        plan()
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
                    if let points = try? await Planner.checkpoints(dep: dep, dest: dest, stops: stops), !Task.isCancelled {
                        self?.checkpoints = points
                        self?.keep()
                    }
                }
                if self.profile == nil || self.profile?.lengthNm != course.distanceNm {
                    Task { [weak self] in
                        if let ground = try? await Planner.routeProfile(dep: dep, dest: dest, stops: stops), !Task.isCancelled {
                            self?.profile = ground
                            self?.keep()
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
                    if self.legs.isEmpty || !(error is URLError) {
                        self.problem = NavLogError(advice: nil, brief: nil, detail: error.localizedDescription, reasons: nil)
                    } else { self.noteKept(self.plannedAt, .plan) }
                    self.stage = nil
                }
            }
            if !Task.isCancelled { self.planning = false }
        }
    }
}
