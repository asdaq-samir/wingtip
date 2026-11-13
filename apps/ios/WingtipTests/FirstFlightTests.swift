import Foundation
import Testing
@testable import Wingtip

/// The first flight's welcome (FirstFlightModel), the web's useFirstFlight:
/// shown with no route until put away, back from the Guide's Show the
/// Welcome Again, never under the tests' launch arguments or in the unit
/// tests' host; and nothing asked or assumed up front. Its foot follows
/// the position's permission (WelcomeFoot).
@MainActor
struct FirstFlightTests {
    private func fresh() -> UserDefaults {
        let name = "first-flight-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func shownWithNoRouteUntilPutAwayAndBackFromTheGuide() {
        let model = FirstFlightModel(defaults: fresh(), arguments: [], environment: [:])
        #expect(model.shown(routed: false))
        #expect(!model.shown(routed: true))
        model.dismiss()
        #expect(!model.shown(routed: false) && model.seen)
        model.again()
        #expect(model.shown(routed: false) && !model.seen)
    }

    @Test func notUnderTheTestsLaunchArgumentsUnlessAskedFor() {
        let defaults = fresh()
        #expect(!FirstFlightModel(defaults: defaults, arguments: ["-screen", "fpl"], environment: [:]).shown(routed: false))
        #expect(!FirstFlightModel(defaults: defaults, arguments: ["-card", "@KOSH"], environment: [:]).shown(routed: false))
        #expect(!FirstFlightModel(defaults: defaults, arguments: [], environment: ["XCTestConfigurationFilePath": "x"]).shown(routed: false))
        #expect(FirstFlightModel(defaults: defaults, arguments: ["-screen", "search", "-firstFlight"], environment: [:]).shown(routed: false))
    }

    @Test func theFootAsksForThePositionUnlessItIsAllowed() {
        // Never asked, or refused before: Turn On Location and Later, the
        // second opening the app's own settings, iOS asking only once.
        #expect(WelcomeFoot.of(.notDetermined) == .ask)
        #expect(WelcomeFoot.of(.denied) == .askInSettings)
        #expect(WelcomeFoot.of(.restricted) == .askInSettings)
        // Allowed already: Let's Go Flying alone.
        #expect(WelcomeFoot.of(.authorizedWhenInUse) == .go)
        #expect(WelcomeFoot.of(.authorizedAlways) == .go)
    }

    @Test func nothingIsAssumedOrAskedUpFront() {
        let plan = Plan()
        let model = FirstFlightModel(defaults: fresh(), arguments: [], environment: [:])
        model.dismiss()
        #expect(!plan.airplaneChosen && plan.tail == nil)
    }

    @Test func theHomeFieldKeptByAnEarlierWelcomeIsRead() {
        let kept = fresh()
        kept.set("KMSN", forKey: FirstFlightModel.homeKey)
        #expect(FirstFlightModel.savedHome(kept) == "KMSN")
        #expect(FirstFlightModel.savedHome(fresh()) == nil)
    }
}
