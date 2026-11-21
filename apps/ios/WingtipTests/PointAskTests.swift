import Foundation
import Testing
@testable import Wingtip

/// The one search's pick of a point of the route (PointAsk, the web's
/// SearchPick): its title, what is refused and why, and where the pick
/// goes in the route.
@MainActor
struct PointAskTests {
    private func plan(_ dep: String, _ stops: [String], _ dest: String) -> Plan {
        let plan = Plan()
        plan.dep = dep; plan.stops = stops; plan.dest = dest
        return plan
    }

    @Test func theTitlesAreMapsOwn() {
        #expect(PointAsk.addStop.title(points: 3) == "Add Stop")
        #expect(PointAsk.change(index: 0, ident: "C81").title(points: 3) == "Departure")
        #expect(PointAsk.change(index: 1, ident: "KMSN").title(points: 3) == "Change Stop")
        #expect(PointAsk.change(index: 2, ident: "KDLH").title(points: 3) == "Destination")
        #expect(PointAsk.change(index: 1, ident: "KMSN").replacing == "KMSN")
        #expect(PointAsk.addStop.replacing == nil)
    }

    @Test func aClosedFieldOrOneOnTheRouteIsRefused() {
        let route = plan("C81", ["KMSN"], "KDLH")
        // The planner's label from the engine's field_status, as sent.
        #expect(route.refusal("KXYZ", closed: "Closed indefinitely", for: .addStop) == "Closed indefinitely")
        #expect(route.refusal("kmsn", closed: nil, for: .addStop) == "Already on the route")
        #expect(route.refusal("KDLH", closed: nil, for: .addStop) == "Already on the route")
        #expect(route.refusal("KJVL", closed: nil, for: .addStop) == nil)
        // The point changed is its own pick; the ends may be one field.
        #expect(route.refusal("KMSN", closed: nil, for: .change(index: 1, ident: "KMSN")) == nil)
        #expect(route.refusal("C81", closed: nil, for: .change(index: 2, ident: "KDLH")) == nil)
        #expect(route.refusal("KMSN", closed: nil, for: .change(index: 0, ident: "C81")) == "Already on the route")
    }

    @Test func aPickGoesWhereItWasAsked() {
        let route = plan("C81", ["KMSN"], "KDLH")
        route.pick("kjvl", for: .addStop)
        #expect(route.stops == ["KMSN", "KJVL"])
        route.pick("KRFD", for: .change(index: 1, ident: "KMSN"))
        #expect(route.stops == ["KRFD", "KJVL"])
        route.pick("KUES", for: .change(index: 0, ident: "C81"))
        #expect(route.dep == "KUES")
        route.pick("KOSH", for: .change(index: 3, ident: "KDLH"))
        #expect(route.dest == "KOSH")
        // A refused pick changes nothing.
        route.pick("KJVL", for: .addStop)
        #expect(route.stops == ["KRFD", "KJVL"])
    }
}
