import Foundation
import Testing
@testable import Wingtip

/// The welcome (WelcomeModel): one card shown once per install, put away
/// for good by Not Now, shown again from Settings, its one action the one
/// search, its sample flight KMSN to KOSH, and nothing asked up front
/// (docs/design/ios.md §14). Each test has defaults of its own.
@MainActor
struct WelcomeTests {
    private func fresh() -> UserDefaults {
        let name = "welcome-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func itIsShownOnceAndNeverAgainOnceNotNow() {
        let defaults = fresh()
        let welcome = WelcomeModel(defaults: defaults, focusSearch: {})
        welcome.showIfWanted(arguments: [])
        #expect(welcome.presented)
        welcome.finish()
        #expect(!welcome.presented && welcome.seen)
        let later = WelcomeModel(defaults: defaults, focusSearch: {})
        later.showIfWanted(arguments: [])
        #expect(!later.presented)
        #expect(!WelcomeModel.wanted(defaults: defaults, arguments: []))
    }

    @Test func searchAnAirportPutsItAwayAndFocusesTheSearch() {
        var focused = 0
        let welcome = WelcomeModel(defaults: fresh(), focusSearch: { focused += 1 })
        welcome.showIfWanted(arguments: [])
        welcome.searchAnAirport()
        #expect(focused == 1)
        #expect(!welcome.presented && welcome.seen)
    }

    @Test func settingsShowsItAgain() {
        let welcome = WelcomeModel(defaults: fresh(), focusSearch: {})
        welcome.finish()
        welcome.again()
        #expect(welcome.presented && !welcome.seen)
    }

    @Test func theUITestsLaunchWithoutIt() {
        let defaults = fresh()
        #expect(WelcomeModel.wanted(defaults: defaults, arguments: []))
        #expect(!WelcomeModel.wanted(defaults: defaults, arguments: ["-screen", "fpl"]))
        #expect(WelcomeModel.wanted(defaults: defaults, arguments: ["-screen", "fpl", "-welcome"]))
    }

    @Test func theSampleFlightIsMadisonToOshkosh() {
        let welcome = WelcomeModel(defaults: fresh(), focusSearch: {})
        let plan = Plan()
        plan.stops = ["KJVL"]
        welcome.showIfWanted(arguments: [])
        welcome.openSample(plan)
        #expect(plan.dep == "KMSN" && plan.dest == "KOSH" && plan.stops.isEmpty)
        #expect(!welcome.presented && welcome.seen)
    }

    @Test func nothingIsAssumedOrAskedUpFront() {
        let plan = Plan()
        let welcome = WelcomeModel(defaults: fresh(), focusSearch: {})
        welcome.showIfWanted(arguments: [])
        welcome.finish()
        #expect(!plan.airplaneChosen && plan.tail == nil)
    }

    @Test func aHomeAirportKeptByAnEarlierWelcomeIsStillRead() {
        let defaults = fresh()
        #expect(WelcomeModel.savedHome(defaults) == nil)
        defaults.set("KMSN", forKey: WelcomeModel.homeKey)
        #expect(WelcomeModel.savedHome(defaults) == "KMSN")
    }
}
