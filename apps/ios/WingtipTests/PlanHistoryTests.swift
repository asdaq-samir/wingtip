import Foundation
import Testing
@testable import Wingtip

/// The route's undo and redo, the plan's one UndoManager's: the cleared
/// route given back whole and cleared again, no step for the same route,
/// at most PlanHistory.limit steps, and the Undo's words the web app's
/// (lib/planHistory).
struct PlanHistoryTests {
    private let route = RouteState(dep: "KMSN", dest: "KDPA", stops: ["KJVL", "KRFD"])

    private func pick(_ ident: String, _ id: String) -> ProcedurePick {
        ProcedurePick(ident: ident, id: id, kind: "IAP", name: id, transition: nil)
    }

    /// A plan on `route`, its undo steps on its own manager, one step per
    /// group as a test makes them (the app groups by event).
    @MainActor
    private func planned() -> (Plan, UndoManager) {
        let plan = Plan(), undo = plan.undoManager
        undo.groupsByEvent = false
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
        #expect(undo.undoActionName == "Route Cleared")
        undo.undo()
        #expect(plan.routeState == route)
        #expect(undo.canRedo)
        undo.redo()
        #expect(plan.routeState == RouteState())
        #expect(undo.canUndo)
    }

    @Test @MainActor func theUndoBarOffersAClearedRouteAndGoesOnUndo() throws {
        let (plan, undo) = planned()
        #expect(plan.undoOffer == nil)
        step(undo) { plan.clear() }
        let offer = try #require(plan.undoOffer)
        #expect(offer.words == "Route Cleared")
        // Undone, the offer goes with the step it offered.
        undo.undo()
        #expect(plan.undoOffer == nil)
        #expect(plan.routeState == route)
    }

    /// From and To typed and not yet planned are the route Clear Route
    /// takes away, and its Undo, which the ✕'s question promises, brings
    /// them back (SheetPageToggleTests' testTheRoutesCloseAsksBeforeClearing).
    @Test @MainActor func aTypedRouteNotYetPlannedComesBackFromClear() throws {
        let plan = Plan(), undo = plan.undoManager
        undo.groupsByEvent = false
        plan.forgetHistory()
        // Typed into the fields: the bindings set the ends, nothing planned.
        plan.dep = "KMSN"; plan.dest = "KOSH"
        step(undo) { plan.clear() }
        let offer = try #require(plan.undoOffer)
        #expect(offer.words == "Route Cleared")
        undo.undo()
        #expect(plan.dep == "KMSN" && plan.dest == "KOSH")
        // Put back as typed: the planner is not asked for a route the
        // pilot had not yet planned.
        #expect(!plan.planning && plan.course == nil)
    }

    /// Two windows over the one plan (the iPad's): one history, so an
    /// Undo in the first window after an edit in the second takes back the
    /// second's edit, the latest, and never puts back a route from before
    /// it; each window's own manager forwards to the plan's.
    @Test @MainActor func twoWindowsShareOneHistory() throws {
        let (plan, history) = planned()
        let first = UndoManager(), second = UndoManager()
        first.groupsByEvent = false
        second.groupsByEvent = false
        plan.windowUndo = first
        first.beginUndoGrouping()
        step(history) { plan.clear() }
        first.endUndoGrouping()
        plan.windowUndo = second
        second.beginUndoGrouping()
        // Planned, not only typed: the fields set the ends without a step
        // (Plan.clear), so the second window's edit is the route planned.
        step(history) { plan.dep = "KMSN"; plan.dest = "KOSH"; plan.plan() }
        second.endUndoGrouping()
        #expect(first.canUndo && second.canUndo)
        first.undo()
        #expect(plan.routeState == RouteState())
        history.undo()
        #expect(plan.routeState == route)
    }

    @Test @MainActor func aLaterOfferStaysWhenTheEarlierTimesOut() throws {
        let (plan, undo) = planned()
        step(undo) { plan.stops = ["KRFD"]; plan.plan() }
        let first = try #require(plan.undoOffer)
        #expect(first.words == "KJVL Removed")
        step(undo) { plan.clear() }
        let second = try #require(plan.undoOffer)
        plan.dismissUndo(first)
        #expect(plan.undoOffer == second)
        plan.dismissUndo(second)
        #expect(plan.undoOffer == nil)
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
        #expect(PlanHistory.note(from: route, to: oneLess) == "KRFD Removed")
        #expect(PlanHistory.note(from: route, to: RouteState(dep: "KMSN", dest: "KDPA")) == "Stops Removed")

        var direct = RouteState(dep: "@42.1000,-88.2000", dest: "KDPA", stops: ["KRFD"])
        direct.extras.direct = "KRFD"
        direct.extras.was = RouteWas(dep: "KMSN", stops: ["KJVL", "KRFD"], dest: "KDPA")
        #expect(PlanHistory.note(from: route, to: direct) == "Direct To KRFD")
        #expect(PlanHistory.note(from: route, to: RouteState(dep: "KMSN", dest: "KUGN", stops: route.stops)) == "Route Replaced")

        var two = route, one = route
        two.procedures = [pick("KDPA", "R02R"), pick("KMSN", "ACKER4")]
        one.procedures = [pick("KMSN", "ACKER4")]
        #expect(PlanHistory.note(from: two, to: one) == "Procedure Removed")

        var held = route
        held.extras.holds = [Hold(fix: "KJVL", inbound: 90, right: true, legMin: 1, legNm: nil, turns: 2, minutes: nil)]
        #expect(PlanHistory.note(from: held, to: route) == "Hold Removed")

        // Adding is not taking away: no bar, shake still undoes it.
        var more = route
        more.stops.append("KUES")
        #expect(PlanHistory.note(from: route, to: more) == nil)
        #expect(PlanHistory.note(from: RouteState(dep: "KMSN"), to: RouteState(dep: "KMSN", dest: "KDPA")) == nil)
    }
}
