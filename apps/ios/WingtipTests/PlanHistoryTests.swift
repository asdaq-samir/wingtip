import Foundation
import Testing
@testable import Wingtip

/// The route's undo and redo, the window's UndoManager's: the cleared
/// route given back whole and cleared again, no step for the same route,
/// at most PlanHistory.limit steps, and the Undo's words the web app's
/// (lib/planHistory).
struct PlanHistoryTests {
    private let route = RouteState(dep: "KMSN", dest: "KDPA", stops: ["KJVL", "KRFD"])

    private func pick(_ ident: String, _ id: String) -> ProcedurePick {
        ProcedurePick(ident: ident, id: id, kind: "IAP", name: id, transition: nil)
    }

    /// A plan on `route`, its undo steps on a manager of its own, one step
    /// per group as a test makes them (the window groups by event).
    @MainActor
    private func planned() -> (Plan, UndoManager) {
        let plan = Plan(), undo = UndoManager()
        undo.groupsByEvent = false
        plan.undoManager = undo
        plan.dep = route.dep; plan.dest = route.dest; plan.stops = route.stops
        plan.forgetHistory()
        return (plan, undo)
    }

    @MainActor
    private func step(_ undo: UndoManager, _ change: () -> Void) {
        undo.beginUndoGrouping()
        change()
        undo.endUndoGrouping()
    }

    @Test @MainActor func aClearedRouteComesBackAndGoesAgain() throws {
        let (plan, undo) = planned()
        step(undo) { plan.clear() }
        #expect(undo.undoActionName == "Route cleared")
        undo.undo()
        #expect(plan.routeState == route)
        #expect(undo.canRedo)
        undo.redo()
        #expect(plan.routeState == RouteState())
        #expect(undo.canUndo)
    }

    @Test @MainActor func theSameRouteIsNoStep() throws {
        let (plan, undo) = planned()
        step(undo) { plan.clear() }
        // Cleared again, nothing changed: no step (one outside a group
        // would stop the test), so one Undo brings the route back.
        plan.clear()
        undo.undo()
        #expect(plan.routeState == route)
    }

    @Test @MainActor func itKeepsAsManyStepsAsTheLimit() throws {
        let (plan, undo) = planned()
        step(undo) { plan.clear() }
        #expect(undo.levelsOfUndo == PlanHistory.limit)
    }

    @Test func itSaysWhatWasTakenAway() throws {
        var oneLess = route
        oneLess.stops = ["KJVL"]
        #expect(PlanHistory.note(from: route, to: oneLess) == "KRFD removed")
        #expect(PlanHistory.note(from: route, to: RouteState(dep: "KMSN", dest: "KDPA")) == "Stops removed")

        var direct = RouteState(dep: "@42.1000,-88.2000", dest: "KDPA", stops: ["KRFD"])
        direct.extras.direct = "KRFD"
        direct.extras.was = RouteWas(dep: "KMSN", stops: ["KJVL", "KRFD"], dest: "KDPA")
        #expect(PlanHistory.note(from: route, to: direct) == "Direct to KRFD")
        #expect(PlanHistory.note(from: route, to: RouteState(dep: "KMSN", dest: "KUGN", stops: route.stops)) == "Route replaced")

        var two = route, one = route
        two.procedures = [pick("KDPA", "R02R"), pick("KMSN", "ACKER4")]
        one.procedures = [pick("KMSN", "ACKER4")]
        #expect(PlanHistory.note(from: two, to: one) == "Procedure removed")

        var held = route
        held.extras.holds = [Hold(fix: "KJVL", inbound: 90, right: true, legMin: 1, legNm: nil, turns: 2, minutes: nil)]
        #expect(PlanHistory.note(from: held, to: route) == "Hold removed")

        // Adding is not taking away: no bar, shake still undoes it.
        var more = route
        more.stops.append("KUES")
        #expect(PlanHistory.note(from: route, to: more) == nil)
        #expect(PlanHistory.note(from: RouteState(dep: "KMSN"), to: RouteState(dep: "KMSN", dest: "KDPA")) == nil)
    }
}
