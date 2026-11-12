import XCTest

/// The map's buttons ride the sheet's top at the right, just above the
/// search row (the owner, 2026-11-11; docs/design/rules.md §7): over the
/// sheet at half and at the pill, at the screen's right edge, each a full
/// tap target, and out of reach with the sheet at full height, as Maps'
/// give way. Offline, at the default text size and accessibility XXL
/// (CardTests.sizes); the sheet's height read off its grabber's value.
final class MapButtonsTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testTheMapsButtonsRideTheSheetsTop() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-screen", "search"], size: size.arguments)
            let map = app.buttons["map-settings"]
            let search = app.searchFields[CardTests.searchPrompt]
            XCTAssertTrue(map.waitForExistence(timeout: 20), "no map button at \(size.name)")
            XCTAssertTrue(search.waitForExistence(timeout: 20), "no search at \(size.name)")
            let grabber = CardTests.grabber(app)
            CardTests.settled(map)
            assertOverTheSheet(map, search: search, in: app, at: "half, \(size.name)")

            // Down to the pill: the buttons come down with it.
            let halfY = map.frame.minY
            grabber.swipeDown()
            CardTests.settled(map)
            XCTAssertGreaterThan(map.frame.minY, halfY + 100, "the buttons did not come down with the sheet at \(size.name)")
            assertOverTheSheet(map, search: search, in: app, at: "pill, \(size.name)")

            // All the way up: they give way.
            grabber.swipeUp()
            grabber.swipeUp()
            CardTests.settled(grabber)
            XCTAssertEqual(grabber.value as? String, "Expanded", "the sheet did not go to full height at \(size.name)")
            XCTAssertFalse(map.exists && map.isHittable, "the map's buttons are still in reach over a full sheet at \(size.name)")
            app.terminate()
        }
    }

    /// The map button just above the search row, at the screen's right,
    /// a 44-point tap at least, and tappable.
    @MainActor
    private func assertOverTheSheet(_ map: XCUIElement, search: XCUIElement, in app: XCUIApplication, at context: String) {
        XCTAssertTrue(map.isHittable, "the map button is out of reach at \(context)")
        XCTAssertLessThanOrEqual(map.frame.maxY, search.frame.minY, "the map button is not above the search at \(context)")
        // The group (Map, My Position, Ask) sits within a few rows of
        // the sheet's top, not left at the top of the screen.
        XCTAssertGreaterThan(map.frame.minY, search.frame.minY - 260, "the map button is not riding the sheet at \(context)")
        XCTAssertEqual(map.frame.maxX, app.frame.maxX, accuracy: 24, "the map button is not at the right edge at \(context)")
        XCTAssertGreaterThanOrEqual(map.frame.height, 44, "the map button's tap is under 44 points at \(context)")
    }
}
