import Foundation
import Testing
@testable import Wingtip

/// The welcome (WelcomeModel): shown once per install, skippable, shown
/// again from Setup, its sample flight KMSN to KOSH, and no airplane
/// assumed (docs/decisions/0011). Each test has defaults of its own.
@MainActor
struct WelcomeTests {
    private func fresh() -> UserDefaults {
        let name = "welcome-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func model(_ defaults: UserDefaults) -> WelcomeModel {
        WelcomeModel(defaults: defaults, search: { _ in [] })
    }

    @Test func itIsShownOnceAndNeverAgainOnceFinished() {
        let defaults = fresh()
        let welcome = model(defaults)
        welcome.showIfWanted(arguments: [])
        #expect(welcome.presented && welcome.step == .airplane)
        for _ in WelcomeModel.Step.allCases { welcome.next() }
        #expect(!welcome.presented && welcome.seen)
        let later = model(defaults)
        later.showIfWanted(arguments: [])
        #expect(!later.presented)
    }

    @Test func skipEndsItAtAnyStepForGood() {
        let defaults = fresh()
        let welcome = model(defaults)
        welcome.showIfWanted(arguments: [])
        welcome.next()
        #expect(welcome.step == .home)
        welcome.skip()
        #expect(!welcome.presented && welcome.seen)
        #expect(!WelcomeModel.wanted(defaults: defaults, arguments: []))
    }

    @Test func setupShowsItAgain() {
        let defaults = fresh()
        let welcome = model(defaults)
        welcome.skip()
        welcome.again()
        #expect(welcome.presented && welcome.step == .airplane && !welcome.seen)
    }

    @Test func theUITestsLaunchWithoutIt() {
        let defaults = fresh()
        #expect(WelcomeModel.wanted(defaults: defaults, arguments: []))
        #expect(!WelcomeModel.wanted(defaults: defaults, arguments: ["-tab", "fpl"]))
        #expect(WelcomeModel.wanted(defaults: defaults, arguments: ["-tab", "fpl", "-welcome"]))
    }

    @Test func answeredPermissionsArePassedOver() {
        let welcome = model(fresh())
        welcome.knowAnswered(location: true, notifications: true)
        welcome.next(); welcome.next()
        #expect(welcome.step == .rules)
        welcome.next()
        #expect(welcome.step == .finish)
    }

    @Test func theSampleFlightIsMadisonToOshkosh() {
        let defaults = fresh()
        let welcome = model(defaults)
        let plan = Plan()
        plan.stops = ["KJVL"]
        welcome.showIfWanted(arguments: [])
        welcome.openSample(plan)
        #expect(plan.dep == "KMSN" && plan.dest == "KOSH" && plan.stops.isEmpty)
        #expect(!welcome.presented && welcome.seen)
    }

    @Test func noAirplaneIsTheDefault() {
        let plan = Plan()
        let welcome = model(fresh())
        #expect(!plan.airplaneChosen && plan.tail == nil)
        plan.aircraft = "pa28"
        welcome.flyNoAirplane(plan)
        #expect(plan.aircraft == Plan.noAirplane && plan.tail == nil)
    }

    @Test func theHomeAirportAndTheRulesAreKept() {
        let defaults = fresh()
        let welcome = model(defaults)
        #expect(welcome.rules == .vfr && welcome.home == nil)
        welcome.rules = .ifr
        welcome.pickHome("KMSN")
        #expect(FlightRules.saved(defaults) == .ifr && WelcomeModel.savedHome(defaults) == "KMSN")
        welcome.pickHome(nil)
        #expect(WelcomeModel.savedHome(defaults) == nil)
    }
}
