import XCTest

/// The card rule's one proof on a pull request (docs/CI.md: a pull
/// request runs one test per journey, the nights run the rest): the
/// airport card opened, its body scrolled with its title and close still
/// in sight, and its close putting it away back to the plan's search, at
/// the default text size. CardRuleTests and CardScrollTests hold every
/// card, every way in and both text sizes, and run every night
/// (native-ios.yml), as they took the job past its forty minutes on three
/// simulators.
final class CardSmokeTests: XCTestCase {
    @MainActor
    func testTheAirportCardOpensScrollsAndCloses() throws {
        let app = CardTests.open(.card("@KOSH"), size: [])
        let shown = CardTests.card(app, "card-airport")
        XCTAssertTrue(shown.waitForExistence(timeout: 20), "the airport card did not open")
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertFalse(search.exists && search.isHittable, "the search is still in reach over the card")
        for _ in 0..<4 { app.swipeUp() }
        let close = CardTests.close(app)
        XCTAssertTrue(close.waitForExistence(timeout: 10) && close.isHittable, "the close scrolled away")
        XCTAssertGreaterThan(close.frame.midX, app.frame.midX, "the close is not at the right")
        close.tap()
        XCTAssertTrue(shown.waitForNonExistence(timeout: 10), "the close did not put the card away")
        XCTAssertTrue(search.waitForExistence(timeout: 10), "the plan's search did not come back")
        app.terminate()
    }
}
