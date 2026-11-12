import XCTest

/// The plan's sheet's two pages, Search and FPL, swiped between under
/// their dots (the owner's carousel, 2026-11-11; docs/design/rules.md):
/// the dots follow a swipe and take a tap, "Plan a Flight" goes to the
/// focused search, a route made shows FPL, and an up or down drag still
/// sizes the sheet on either page. Offline: the sample flight's ends are
/// enough to make a route, whatever the planner answers.
final class SheetCarouselTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    private func launch() -> XCUIApplication {
        CardTests.launch(["-screen", "search"], size: [])
    }

    @MainActor
    private func dots(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)["sheet-page-dots"]
    }

    @MainActor
    func testSwipingMovesThePagesAndTheDotsFollowAndTakeATap() throws {
        let app = launch()
        let dots = dots(app)
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(dots.waitForExistence(timeout: 20), "no page dots")
        XCTAssertTrue(search.waitForExistence(timeout: 20), "the sheet did not open on Search")
        XCTAssertEqual(dots.value as? String, "Page 1 of 2, Search")

        let pager = app.descendants(matching: .any)["sheet-pager"]
        pager.swipeLeft()
        XCTAssertTrue(app.otherElements["plan-a-flight"].waitForExistence(timeout: 10), "a swipe did not go to FPL")
        XCTAssertEqual(dots.value as? String, "Page 2 of 2, FPL")
        XCTAssertFalse(search.exists && search.isHittable, "the search's row is still on the FPL page")

        pager.swipeRight()
        XCTAssertTrue(search.waitForExistence(timeout: 10) && search.isHittable, "a swipe did not come back to Search")
        XCTAssertEqual(dots.value as? String, "Page 1 of 2, Search")

        // The stock control's tap to the right of its dot moves on a page.
        dots.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertEqual(dots.value as? String, "Page 2 of 2, FPL", "a tap on the dots did not turn the page")
        XCTAssertGreaterThanOrEqual(dots.frame.height, 28, "the dots' row shrank")
    }

    @MainActor
    func testPlanAFlightGoesToTheFocusedSearch() throws {
        let app = launch()
        app.descendants(matching: .any)["sheet-pager"].swipeLeft()
        let button = app.buttons["plan-a-flight-search"]
        XCTAssertTrue(button.waitForExistence(timeout: 10), "no Search on Plan a Flight")
        button.tap()
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(search.waitForExistence(timeout: 10) && search.isHittable, "Search did not come up")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10), "the search field is not focused")
    }

    @MainActor
    func testARouteMadeShowsTheFplPage() throws {
        let app = launch()
        app.descendants(matching: .any)["sheet-pager"].swipeLeft()
        let sample = app.buttons["plan-a-flight-sample"]
        XCTAssertTrue(sample.waitForExistence(timeout: 10), "no sample flight on Plan a Flight")
        sample.tap()
        XCTAssertTrue(app.staticTexts["route-card-title"].waitForExistence(timeout: 20), "the route's card did not show")
        XCTAssertEqual(dots(app).value as? String, "Page 2 of 2, FPL")
    }

    @MainActor
    func testAnUpOrDownDragStillSizesTheSheetOnBothPages() throws {
        let app = launch()
        let grabber = CardTests.grabber(app)
        let dots = dots(app)
        XCTAssertTrue(dots.waitForExistence(timeout: 20), "no page dots")
        for page in ["Search", "FPL"] {
            CardTests.settled(dots)
            let half = dots.frame.minY
            grabber.swipeDown()
            CardTests.settled(dots)
            XCTAssertGreaterThan(dots.frame.minY, half + 100, "the sheet did not come down on \(page)")
            XCTAssertTrue(dots.isHittable, "the dots are gone at the pill on \(page)")
            grabber.swipeUp()
            CardTests.settled(dots)
            XCTAssertEqual(dots.frame.minY, half, accuracy: 8, "the sheet did not go back up on \(page)")
            app.descendants(matching: .any)["sheet-pager"].swipeLeft()
        }
    }
}
