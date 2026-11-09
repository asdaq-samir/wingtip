import Foundation
import Observation

/// The Route Leg sheet's model: the leg tapped on the map (its index, the
/// sheet held by FlightUI's card), its contents from the plan and the
/// airplane's place on the route (RouteLegs.sheet), and its two actions,
/// each the route list's own -- Direct to the leg's end (Plan.directTo,
/// Cancel Direct where it is flown direct already) and a stop taken out.
/// Each closes the sheet, as the web's does.
@MainActor
@Observable
final class RouteLegModel {
    let index: Int

    init(index: Int) { self.index = index }

    /// The legs of the plan's line now.
    static func mapLegs(_ plan: Plan) -> [RouteLegs.MapLeg] {
        RouteLegs.legs(RouteShare.points(plan))
    }

    /// The sheet for the leg, nil where the route has changed under it.
    func sheet(plan: Plan, nextIndex: Int?) -> RouteLegs.Sheet? {
        let legs = Self.mapLegs(plan)
        guard legs.indices.contains(index) else { return nil }
        return RouteLegs.sheet(legs[index], mapLegs: legs.count, legs: plan.legs, nextIndex: nextIndex,
                               stops: plan.stops, dest: plan.dest, direct: plan.extras.direct)
    }

    func direct(_ sheet: RouteLegs.Sheet, plan: Plan, from fix: OwnShip.Fix?) {
        guard let direct = sheet.direct else { return }
        if direct.on { plan.cancelDirect() } else { plan.directTo(direct.ident, from: fix) }
        FlightUI.shared.card = nil
    }

    func remove(_ sheet: RouteLegs.Sheet, plan: Plan) {
        guard let stop = sheet.remove else { return }
        plan.stops.removeAll { $0.uppercased() == stop.uppercased() }
        plan.plan()
        FlightUI.shared.card = nil
    }
}
