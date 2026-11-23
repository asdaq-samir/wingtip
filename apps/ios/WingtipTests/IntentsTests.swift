import AppIntents
import Testing
@testable import Wingtip

/// Siri's and Shortcuts' intents: what each leaves for the app to do
/// (AppCommand, BriefAsk), the radio's switch, the airport as
/// Spotlight indexes it, and the shortcuts within Apple's ten.
@MainActor
struct IntentsTests {
    private let oshkosh = AirportEntity(id: "kosh", name: "Wittman Rgnl", city: "Oshkosh")

    // What each intent asks of the app is read from the intent's own
    // command (the scene's, CommandHost), and the run itself only
    // has to go through.
    @Test func briefMyFlightAsksForTheBriefOfARouteThere() async throws {
        #expect(BriefFlightIntent.command(oshkosh) == .brief(ident: "KOSH"))
        let intent = BriefFlightIntent()
        intent.airport = oshkosh
        _ = try await intent.perform()
    }

    @Test func anAirportFromSpotlightOpensItsCard() async throws {
        #expect(OpenAirportIntent.command(oshkosh) == .weather(ident: "KOSH"))
        let intent = OpenAirportIntent()
        intent.target = oshkosh
        _ = try await intent.perform()
    }

    @Test func directToTheNearestOpensOnItsFieldElseTheList() {
        #expect(OpenWingtipIntent(directTo: "KFCM").appCommand() == .directTo(place: "KFCM"))
        #expect(OpenWingtipIntent(directTo: nil).appCommand() == .nearest)
        #expect(NearestAirportsIntent().appCommand() == .nearest)
        #expect(EmergencyIntent().appCommand() == .open(.emergency))
    }

    @Test func theBriefIsTakenOnce() {
        let ask = BriefAsk()
        #expect(!ask.take())
        ask.ask()
        #expect(ask.wanted)
        #expect(ask.take())
        #expect(!ask.take())
    }

    @Test func stoppingTheRadioWhenNotListening() async throws {
        #expect(!ClearanceListener.shared.listening)
        #expect(!RadioSwitch.stop())
        _ = try await StopListeningIntent().perform()
        #expect(!ClearanceListener.shared.listening)
    }

    @Test func spotlightFindsAFieldByIdentNameAndTown() {
        let set = oshkosh.attributeSet
        #expect(set.displayName == "KOSH · Wittman Rgnl")
        #expect(set.contentDescription == "Oshkosh")
        #expect(set.keywords == ["KOSH", "Wittman Rgnl", "Oshkosh"])
        let bare = AirportEntity(id: "3ck", name: "").attributeSet
        #expect(bare.displayName == "3CK")
        #expect(bare.keywords == ["3CK"])
    }

    @Test func shortcutsWithinApplesTen() {
        let shortcuts = WingtipShortcuts.appShortcuts
        #expect(shortcuts.count == 10)
        #expect(shortcuts.count <= 10)
    }
}
