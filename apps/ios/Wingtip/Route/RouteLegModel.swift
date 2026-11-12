import Foundation
import Observation

/// The Route Leg card's model: the leg by its index on the map's line
/// (SheetPage.leg, from the map's course or a nav log row), its contents
/// from the plan and the airplane's place on the route (RouteLegs.sheet),
/// the nav log's leg for its figures, and its two actions, each the route
/// list's own -- Direct to the leg's end (Plan.directTo, Cancel Direct
/// where it is flown direct already) and a stop taken out. Each closes
/// the card, or goes back to the nav log it was opened from, as the web's
/// does.
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

    /// The nav log's leg for this one: the same index where the two are
    /// one to one, else the leg between the same two points.
    func navLeg(plan: Plan) -> Leg? {
        let legs = Self.mapLegs(plan)
        guard legs.indices.contains(index) else { return nil }
        if legs.count == plan.legs.count { return plan.legs[index] }
        let leg = legs[index]
        return plan.legs.first { $0.from.uppercased() == leg.from.uppercased() && $0.to.uppercased() == leg.to.uppercased() }
    }

    /// The map's index of a nav log leg, the nav log's row's card: the
    /// same where the two are one to one, else the leg between the same
    /// two points; its own place in the nav log where neither is found.
    static func index(of leg: Leg, at row: Int, plan: Plan) -> Int {
        let legs = mapLegs(plan)
        if legs.count == plan.legs.count { return row }
        return legs.first { $0.from.uppercased() == leg.from.uppercased() && $0.to.uppercased() == leg.to.uppercased() }?.index ?? row
    }

    func direct(_ sheet: RouteLegs.Sheet, plan: Plan, from fix: OwnShip.Fix?, nav: Navigator) {
        guard let direct = sheet.direct else { return }
        if direct.on { plan.cancelDirect() } else { plan.directTo(direct.ident, from: fix) }
        nav.finish(.leg(index))
    }

    func remove(_ sheet: RouteLegs.Sheet, plan: Plan, nav: Navigator) {
        guard let stop = sheet.remove else { return }
        plan.stops.removeAll { $0.uppercased() == stop.uppercased() }
        plan.plan()
        nav.finish(.leg(index))
    }
}
