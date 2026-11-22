import Foundation
import Testing
@testable import Wingtip

/// The parked features' switches (Extra, Settings' Extras): each off until
/// turned on, under its own "extras.<key>", and another airplane's history
/// offered only with Other Airplanes on, the pilot's own always.
struct ExtrasTests {
    private func freshDefaults() throws -> UserDefaults {
        try #require(UserDefaults(suiteName: "wingtip-extras-\(UUID().uuidString)"))
    }

    @Test func everySwitchIsOffUntilTurnedOn() throws {
        let defaults = try freshDefaults()
        for extra in Extra.allCases { #expect(!extra.on(defaults), "\(extra) is on by default") }
        defaults.set(true, forKey: Extra.modelWeather.key)
        #expect(Extra.modelWeather.on(defaults))
        #expect(!Extra.atcCopilot.on(defaults) && !Extra.trainingTools.on(defaults))
    }

    @Test func theKeysAreTheWebsUnderExtras() {
        #expect(Extra.allCases.map(\.key) == ["extras.atcCopilot", "extras.adsbReceiver", "extras.otherAirplanes",
                                              "extras.modelWeather", "extras.trainingTools"])
    }

    @Test func anotherAirplanesHistoryWaitsForItsSwitch() {
        let own = ["N3429J"]
        #expect(Extra.airplaneHistory("N3429J", own: own, others: false))
        #expect(Extra.airplaneHistory("3429J", own: own, others: false))
        #expect(!Extra.airplaneHistory("N654FL", own: own, others: false))
        #expect(!Extra.airplaneHistory(nil, own: own, others: false))
        #expect(Extra.airplaneHistory("N654FL", own: own, others: true))
    }
}
