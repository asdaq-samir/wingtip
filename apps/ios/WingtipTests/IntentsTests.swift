import AppIntents
@testable import Wingtip
import XCTest

/// Siri's and Shortcuts' intents: what each leaves for the app to do
/// (AppCommand, BriefAsk), the radio's switch, the airport as
/// Spotlight indexes it, and the shortcuts within Apple's ten.
@MainActor
final class IntentsTests: XCTestCase {
    private let oshkosh = AirportEntity(id: "kosh", name: "Wittman Rgnl", city: "Oshkosh")

    // What each intent asks of the app is read from the intent's own
    // command (the scene's on iOS 26, CommandHost), and the run itself only
    // has to go through.
    func testBriefMyFlightAsksForTheBriefOfARouteThere() async throws {
        XCTAssertEqual(BriefFlightIntent.command(oshkosh), .brief(ident: "KOSH"))
        let intent = BriefFlightIntent()
        intent.airport = oshkosh
        _ = try await intent.perform()
    }

    func testAnAirportFromSpotlightOpensItsCard() async throws {
        XCTAssertEqual(OpenAirportIntent.command(oshkosh), .weather(ident: "KOSH"))
        let intent = OpenAirportIntent()
        intent.target = oshkosh
        _ = try await intent.perform()
    }

    func testDirectToTheNearestOpensOnItsFieldElseTheList() {
        XCTAssertEqual(OpenWingtipIntent(directTo: "KFCM").appCommand(), .directTo(place: "KFCM"))
        XCTAssertEqual(OpenWingtipIntent(directTo: nil).appCommand(), .nearest)
        XCTAssertEqual(NearestAirportsIntent().appCommand(), .nearest)
        XCTAssertEqual(EmergencyIntent().appCommand(), .open(.emergency))
    }

    func testACommandLeftBeforeIOS26IsTakenOnce() {
        let commands = AppCommands()
        commands.waiting = .keepForAir
        XCTAssertEqual(commands.take(), .keepForAir)
        XCTAssertNil(commands.take())
    }

    func testTheBriefIsTakenOnce() {
        let ask = BriefAsk()
        XCTAssertFalse(ask.take())
        ask.ask()
        XCTAssertTrue(ask.wanted)
        XCTAssertTrue(ask.take())
        XCTAssertFalse(ask.take())
    }

    func testStoppingTheRadioWhenNotListening() async throws {
        XCTAssertFalse(ClearanceListener.shared.listening)
        XCTAssertFalse(RadioSwitch.stop())
        _ = try await StopListeningIntent().perform()
        XCTAssertFalse(ClearanceListener.shared.listening)
    }

    func testSpotlightFindsAFieldByIdentNameAndTown() {
        let set = oshkosh.attributeSet
        XCTAssertEqual(set.displayName, "KOSH · Wittman Rgnl")
        XCTAssertEqual(set.contentDescription, "Oshkosh")
        XCTAssertEqual(set.keywords, ["KOSH", "Wittman Rgnl", "Oshkosh"])
        let bare = AirportEntity(id: "3ck", name: "").attributeSet
        XCTAssertEqual(bare.displayName, "3CK")
        XCTAssertEqual(bare.keywords, ["3CK"])
    }

    func testShortcutsWithinApplesTen() {
        let shortcuts = WingtipShortcuts.appShortcuts
        XCTAssertEqual(shortcuts.count, 10)
        XCTAssertLessThanOrEqual(shortcuts.count, 10)
    }
}
