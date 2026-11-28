import Testing
import UIKit
@testable import Wingtip

/// Settings' Appearance (Appearance), the web's three picks, read back
/// from the app's scheme, and the window's style each sets.
struct AppearanceTests {
    @Test func eachPickSetsTheSchemeAndReadsBack() {
        #expect(Appearance.allCases == [.system, .light, .dark])
        for pick in Appearance.allCases {
            #expect(Appearance.of(scheme: pick.scheme) == pick)
        }
    }

    @Test func theWindowFollowsThePhoneUnlessLightOrDarkIsPicked() {
        #expect(Appearance.style("system") == .unspecified)
        #expect(Appearance.style("light") == .light)
        #expect(Appearance.style("dark") == .dark)
    }
}
