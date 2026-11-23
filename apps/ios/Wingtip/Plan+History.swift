import Foundation

/// The route's steps back and forward (PlanHistory): each change taken in
/// as one the plan's UndoManager can undo (its one history, every window's
/// manager forwarding to it), the undo bar's offer of it,
/// and the history forgotten at sign-out. Its state is Plan's own
/// (lastState, remembering, undoOffer); this is what moves it.
extension Plan {
    /// The route as it is now taken in: a change is a step the plan's
    /// UndoManager can take back, holding the route as it was, named for
    /// what it took away ("Undo Route cleared") and said to VoiceOver
    /// where it took something. An Undo puts the route back (put), which
    /// comes through here again inside the UndoManager's undo, so the
    /// step it registers is the Redo, as the system does it. `planned`:
    /// whether the route now is one the planner was asked for, so its
    /// Undo or Redo plans it again only then.
    func remember(planned: Bool = true) {
        guard remembering else { return }
        let next = routeState, before = lastState, plannedBefore = lastPlanned
        guard next != before else { return }
        lastState = next
        lastPlanned = planned
        let note = PlanHistory.note(from: before, to: next)
        let stepping = undoManager.isUndoing || undoManager.isRedoing
        if stepping {
            undoOffer = nil
        } else if let note {
            Announce.alert(note)
            undoOffer = UndoOffer(note)
        }
        let name = note ?? "Route Change"
        undoManager.levelsOfUndo = PlanHistory.limit
        undoManager.register(self, named: name) { $0.put(before, planned: plannedBefore) }
        // A new step (not an Undo's or Redo's own) reachable from the
        // window it was made in: shake, ⌘Z and the Edit menu.
        if !stepping { windowUndo?.forward(to: undoManager, named: name) }
    }

    /// The route as it was set: planned again where it had been, else
    /// put back as it was typed (or forgotten where it is no route), and
    /// taken in as the step to go back over.
    private func put(_ state: RouteState, planned: Bool) {
        dep = state.dep; dest = state.dest; stops = state.stops; procedures = state.procedures; extras = state.extras
        ownAltitudeFt = state.ownAltitudeFt; ownAltitudeLegal = state.ownAltitudeLegal; altitudeChoice = state.altitudeChoice
        if routed, planned { plan() } else { forgetPlanned() }
        remember(planned: routed && planned)
    }

    /// No steps back: a signed-out pilot's routes are not the next one's.
    func forgetHistory() {
        lastState = routeState
        undoOffer = nil
        undoManager.forget(self)
        windowUndo?.forget(undoManager)
    }

    /// The undo bar's offer put away: its time up, or Undo tapped. A later
    /// offer in its place stays.
    func dismissUndo(_ offer: UndoOffer) {
        if undoOffer?.id == offer.id { undoOffer = nil }
    }
}
