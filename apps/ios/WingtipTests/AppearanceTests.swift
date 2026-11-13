import Testing
import UIKit
@testable import Wingtip

/// Settings' Appearance (Appearance), the web's four picks over two
/// settings: the app's scheme and the chart at night, read back from them
/// as the web reads its two; and the window's style each sets.
struct AppearanceTests {
    @Test func eachPickSetsTheSchemeAndTheChartAndReadsBack() {
        for pick in Appearance.allCases {
            #expect(Appearance.of(scheme: pick.scheme, chartNight: pick.chartNight.rawValue) == pick)
        }
        // Dark dims the chart for night vision; Dark + Bright keeps it as printed.
        #expect(Appearance.dark.chartNight == .dimmed)
        #expect(Appearance.darkBright.chartNight == .normal)
        #expect(Appearance.dark.scheme == "dark" && Appearance.darkBright.scheme == "dark")
    }

    @Test func aDeviceThatKeptTheChartAsPrintedStaysSystemUntilDarkIsPicked() {
        // The old Chart at Night's Normal under the phone's own appearance.
        #expect(Appearance.of(scheme: "system", chartNight: ChartNight.normal.rawValue) == .system)
        #expect(Appearance.of(scheme: "light", chartNight: ChartNight.normal.rawValue) == .light)
    }

    @Test func theWindowFollowsThePhoneUnlessLightOrDarkIsPicked() {
        #expect(Appearance.style("system") == .unspecified)
        #expect(Appearance.style("light") == .light)
        #expect(Appearance.style("dark") == .dark)
    }
}
