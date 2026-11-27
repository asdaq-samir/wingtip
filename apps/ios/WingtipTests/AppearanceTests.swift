import Testing
import UIKit
@testable import Wingtip

/// Settings' Appearance (Appearance), the web's three picks, read back
/// from the app's scheme; the window's style each sets; and Dark + Bright,
/// gone as on the web, kept as Dark with the chart undimmed (ChartLook).
struct AppearanceTests {
    @Test func eachPickSetsTheSchemeAndReadsBack() {
        #expect(Appearance.allCases == [.system, .light, .dark])
        for pick in Appearance.allCases {
            #expect(Appearance.of(scheme: pick.scheme) == pick)
        }
    }

    @Test func aKeptDarkPlusBrightIsDarkWithTheChartUndimmed() throws {
        let defaults = try #require(UserDefaults(suiteName: "AppearanceTests.migrate"))
        defaults.removePersistentDomain(forName: "AppearanceTests.migrate")
        defaults.set("dark", forKey: Appearance.schemeKey)
        defaults.set("normal", forKey: ChartLook.Keys.chartNight)
        ChartLook.migrate(defaults)
        #expect(Appearance.of(scheme: defaults.string(forKey: Appearance.schemeKey) ?? "") == .dark)
        #expect(defaults.double(forKey: ChartLook.Keys.dimDark) == 0)
        #expect(defaults.object(forKey: ChartLook.Keys.chartNight) == nil)
        // Dimmed, the old default, leaves the night's own Dimmer as it is.
        defaults.set("dimmed", forKey: ChartLook.Keys.chartNight)
        defaults.removeObject(forKey: ChartLook.Keys.dimDark)
        ChartLook.migrate(defaults)
        #expect(defaults.object(forKey: ChartLook.Keys.dimDark) == nil)
    }

    @Test func theWindowFollowsThePhoneUnlessLightOrDarkIsPicked() {
        #expect(Appearance.style("system") == .unspecified)
        #expect(Appearance.style("light") == .light)
        #expect(Appearance.style("dark") == .dark)
    }
}
