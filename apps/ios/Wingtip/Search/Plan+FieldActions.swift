import SwiftUI

/// The airport card's three plan actions (the one-search design,
/// 2026-11-09: Fly Here, Depart From, Add as Stop), and the route to a
/// field Siri and a Shortcut ask for, done the one way wherever they are
/// asked. Each sets the route the planner then works out; none works a
/// figure out here.
extension Plan {
    /// The field the destination, from the route's departure, else from
    /// the field nearest the airplane (the planner's /api/airports/nearest);
    /// with neither, the destination alone, the plan asking for the
    /// departure in its From field.
    func flyHere(_ ident: String, near fix: OwnShip.Fix?) async {
        dest = ident
        if dep.isEmpty, let at = fix?.coordinate,
           let nearest = try? await Planner.nearestOrPacks(lat: at.latitude, lon: at.longitude, limit: 1).fields.first,
           nearest.ident != ident {
            dep = nearest.ident
        }
        Feel.tap(.directTo)
        plan()
    }

    /// The field the departure; planned once there is a destination too.
    func departFrom(_ ident: String) {
        dep = ident
        if dest == ident { dest = "" }
        plan()
    }

    /// The field a landing on the way, after the last stop; only on a
    /// route, and only once.
    func addStop(_ ident: String) {
        guard canAddStop(ident) else { return }
        stops.append(ident)
        plan()
    }

    func canAddStop(_ ident: String) -> Bool {
        routed && !idents.contains(ident)
    }
}

extension EnvironmentValues {
    /// Back to the plan, the sheet's root, from a card over it: the sheet
    /// sets it (PlanSheet), the airport card's actions call it once the
    /// route is set (the Airport artboard's "they set the plan and show
    /// the plan"). Nil where there is no plan to go back to.
    var showPlan: (@MainActor () -> Void)? {
        get { self[ShowPlanKey.self] }
        set { self[ShowPlanKey.self] = newValue }
    }
}

// A key of its own rather than @Entry, whose macro warns of a stored
// closure (SplitLayout's OpenCardKey says why).
private struct ShowPlanKey: EnvironmentKey {
    static let defaultValue: (@MainActor () -> Void)? = nil
}
