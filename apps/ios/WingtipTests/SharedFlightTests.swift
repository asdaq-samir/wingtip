import Foundation
import Testing
@testable import Wingtip

/// A flight another pilot sent: its link read into a preview, never a plan
/// by itself; the link the app sends; and the preview's Use This Plan and
/// Not Now (SharedFlightModel).
@MainActor
struct SharedFlightTests {
    @Test func aPlainLinkIsAPreview_notARoutePlanned() throws {
        let url = URL(string: "https://wingtipmaps.app/app/plan?open=shared&dep=kmsn&dest=KOSH&stops=KJVL&altitude_ft=3500&depart=2026-11-10T15:00:00Z&type=C172&rules=vfr")!
        guard case .sharedFlight(.plan(let plan)) = Links.command(for: url) else {
            Issue.record("a shared link must be previewed, not planned")
            return
        }
        #expect(plan.dep == "KMSN" && plan.dest == "KOSH" && plan.stops == ["KJVL"])
        #expect(plan.altitudeFt == 3500 && plan.type == "C172" && plan.rules == .vfr && plan.tail == nil)
        #expect(plan.depart == ISO8601DateFormatter().date(from: "2026-11-10T15:00:00Z"))
    }

    @Test func aSavedFlightsLinkCarriesItsToken() {
        let url = URL(string: "wingtipmaps://plan?open=shared&share=abcdefghijklmnopqrstuv")!
        #expect(Links.command(for: url) == .sharedFlight(.saved(token: "abcdefghijklmnopqrstuv")))
    }

    @Test func aSharedLinkWithNoFlightIsNothing() {
        #expect(Links.command(for: URL(string: "https://wingtipmaps.app/app/plan?open=shared")!) == nil)
    }

    @Test func theLinkSentOpensThePreview_andTheNumberOnlyWhenAsked() throws {
        let plan = SharedPlan(dep: "KMSN", dest: "KOSH", altitudeFt: 3500, type: "C172", rules: .ifr, tail: "N123AB")
        let host = URL(string: "https://wingtipmaps.app")!
        let without = plan.link(includeTail: false, host: host)
        #expect(without.absoluteString == "https://wingtipmaps.app/app/plan?open=shared&dep=KMSN&dest=KOSH&altitude_ft=3500&type=C172&rules=ifr")
        #expect(plan.link(includeTail: true, host: host).absoluteString.hasSuffix("&tail=N123AB"))
        // Read back as it was sent.
        #expect(Links.command(for: without) == .sharedFlight(.plan(SharedPlan(dep: "KMSN", dest: "KOSH", altitudeFt: 3500, type: "C172", rules: .ifr))))
    }

    /// The fuel set on the gauges goes with the link as the planner's own
    /// `tanks` (design/screens.json's key, LinkKey.tanks), as Android's
    /// does, and is read back warily: a part that is not an ident and
    /// whole gallons from 0 to 9,999 is left out, never guessed. Use This
    /// Plan puts it on the receiver's gauges.
    @Test func theFuelSetGoesWithTheLinkAndIsReadBackWarily() throws {
        let plan = SharedPlan(dep: "KMSN", dest: "KOSH", stops: ["KJVL"], tanks: ["KMSN": 30, "KJVL": 0])
        let link = plan.link(includeTail: false, host: URL(string: "https://wingtipmaps.app")!)
        #expect(link.absoluteString.contains("&tanks=KJVL:0,KMSN:30"))
        #expect(Links.command(for: link) == .sharedFlight(.plan(plan)))
        #expect(SharedPlan.tanks("KMSN:30,bad,KJVL:-4,KOSH:12.5,KDLH:10000,kmke:20") == ["KMSN": 30, "KMKE": 20])
        #expect(SharedPlan.tanks(nil).isEmpty)

        let model = SharedFlightModel(calls: .init(fetch: { _ in nil }))
        let route = Plan()
        model.open(.plan(plan))
        _ = model.use(on: route, defaults: UserDefaults(suiteName: "SharedFlightTests")!)
        #expect(route.extras.tanks == ["KMSN": 30, "KJVL": 0])
    }

    @Test func notNowLeavesThePlanAsItWas() {
        let model = SharedFlightModel(calls: .init(fetch: { _ in nil }))
        let route = Plan()
        route.dep = "C81"; route.dest = "KDLH"
        model.open(.plan(SharedPlan(dep: "KMSN", dest: "KOSH")))
        model.notNow()
        #expect(!model.showing && route.dep == "C81" && route.dest == "KDLH")
    }

    @Test func useThisPlanAsksForTheRouteAndItsNavLog() {
        let model = SharedFlightModel(calls: .init(fetch: { _ in nil }))
        let route = Plan()
        let defaults = UserDefaults(suiteName: "SharedFlightTests")!
        model.open(.plan(SharedPlan(dep: "KMSN", dest: "KOSH", stops: ["KJVL"], altitudeFt: 5500, rules: .ifr)))
        let command = model.use(on: route, defaults: defaults)
        #expect(command == .planRoute(dep: "KMSN", stops: ["KJVL"], dest: "KOSH"))
        #expect(route.ownAltitudeFt == 5500 && FlightRules.saved(defaults) == .ifr && !model.showing)
    }

    @Test func aStoppedShareSaysSo() async {
        let model = SharedFlightModel(calls: .init(fetch: { _ in nil }))
        model.open(.saved(token: "gone"))
        await model.load()
        #expect(model.gone && model.plan == nil)
    }
}
