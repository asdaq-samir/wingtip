import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// The first flight's card (FirstFlightModel), the web's useFirstFlight:
/// shown with no route until planned or put away, back from the Guide's
/// Show First Flight Again, planning from the nearest field, else the home
/// field, else asking where from; and nothing asked or assumed up front.
@MainActor
struct FirstFlightTests {
    private func fresh() -> UserDefaults {
        let name = "first-flight-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private let fix = OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 43.14, longitude: -89.34), altitudeFt: nil, trackDeg: nil,
                                  groundspeedKt: nil, accuracyM: 5, at: Date())

    @Test func shownWithNoRouteUntilPutAwayAndBackFromTheGuide() {
        let model = FirstFlightModel(defaults: fresh(), arguments: [])
        #expect(model.shown(routed: false))
        #expect(!model.shown(routed: true))
        model.dismiss()
        #expect(!model.shown(routed: false) && model.seen)
        model.again()
        #expect(model.shown(routed: false) && !model.seen)
    }

    @Test func notUnderTheTestsLaunchArgumentsUnlessAskedFor() {
        let defaults = fresh()
        #expect(!FirstFlightModel(defaults: defaults, arguments: ["-screen", "fpl"]).shown(routed: false))
        #expect(!FirstFlightModel(defaults: defaults, arguments: ["-card", "@KOSH"]).shown(routed: false))
        #expect(FirstFlightModel(defaults: defaults, arguments: ["-screen", "search", "-firstFlight"]).shown(routed: false))
    }

    @Test func planItFliesFromTheNearestFieldAndIsThenGoneForGood() async {
        let defaults = fresh()
        let model = FirstFlightModel(defaults: defaults, arguments: [])
        let plan = Plan()
        model.dest = "KOSH · Wittman Regional"
        #expect(model.destIdent == "KOSH" && model.ready)
        var opened = 0
        await model.planIt(plan: plan, fix: fix, home: nil, nearest: { _ in "KMSN" }) { opened += 1 }
        #expect(plan.dep == "KMSN" && plan.dest == "KOSH" && plan.stops.isEmpty)
        #expect(opened == 1 && model.seen && !model.shown(routed: false))
    }

    @Test func withNoPositionTheHomeFieldElseItAsksWhereFrom() async {
        let defaults = fresh()
        let model = FirstFlightModel(defaults: defaults, arguments: [])
        let plan = Plan()
        model.dest = "kosh"
        var opened = 0
        await model.planIt(plan: plan, fix: nil, home: nil, nearest: { _ in nil }) { opened += 1 }
        #expect(model.needsFrom && !model.ready && opened == 0 && plan.dest.isEmpty)
        model.from = "C81"
        #expect(model.ready)
        await model.planIt(plan: plan, fix: nil, home: nil, nearest: { _ in nil }) { opened += 1 }
        #expect(plan.dep == "C81" && plan.dest == "KOSH" && opened == 1)

        let kept = fresh()
        kept.set("KMSN", forKey: FirstFlightModel.homeKey)
        #expect(FirstFlightModel.savedHome(kept) == "KMSN")
        let other = FirstFlightModel(defaults: kept, arguments: [])
        other.dest = "KOSH"
        await other.planIt(plan: plan, fix: nil, home: nil, nearest: { _ in nil }) {}
        #expect(plan.dep == "KMSN" && !other.needsFrom)
    }

    @Test func flyingToWhereYouAreIsSaid() async {
        let model = FirstFlightModel(defaults: fresh(), arguments: [])
        let plan = Plan()
        model.dest = "KMSN"
        await model.planIt(plan: plan, fix: fix, home: nil, nearest: { _ in "KMSN" }) {}
        #expect(model.problem == "KMSN is where you are. Pick somewhere to fly to.")
        #expect(plan.dest.isEmpty && !model.seen)
    }

    @Test func nothingIsAssumedOrAskedUpFront() {
        let plan = Plan()
        let model = FirstFlightModel(defaults: fresh(), arguments: [])
        model.dismiss()
        #expect(!plan.airplaneChosen && plan.tail == nil)
    }
}
