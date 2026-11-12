import XCTest

/// The plan's sheet's two pages, Search and FPL, swiped between under
/// their dots (the owner's carousel, 2026-11-11; docs/design/rules.md):
/// the dots follow a swipe and take a tap, FPL with no route is the route
/// box empty whose close goes back to Search, Fly Here from a field's card
/// lands on FPL (twice to the same field too) and the empty box's close
/// then goes back to that card, a card opened over Search closes back to
/// Search, and an up or down drag still sizes the sheet on either page.
/// Offline, but for Fly Here, whose card needs the planner (PlannerHost).
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
        XCTAssertTrue(app.textFields["To"].waitForExistence(timeout: 10), "a swipe did not go to FPL")
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
    func testTheEmptyRoutesCloseGoesBackToSearch() throws {
        let app = launch()
        let pager = app.descendants(matching: .any)["sheet-pager"]
        XCTAssertTrue(pager.waitForExistence(timeout: 20), "no pager")
        CardTests.dragSideways(pager, in: app, left: true)
        XCTAssertFalse(app.otherElements["plan-a-flight"].exists, "FPL still says Plan a Flight")
        let close = app.buttons["route-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 10), "no close on the empty route box")
        close.tap()
        XCTAssertEqual(dots(app).value as? String, "Page 1 of 2, Search", "the empty box's close did not go back to Search")
    }

    @MainActor
    func testFlyHereLandsOnFplEvenToTheSameFieldAgain() async throws {
        // The field's card, and so its Fly Here, is the planner's answer:
        // with no planner the card shows only that it could not be had.
        try await PlannerHost.skipWithoutAddress()
        let app = CardTests.launch(["-card", "@KOSH"], size: [])
        let dots = dots(app)
        for time in ["first", "second"] {
            let flyHere = app.descendants(matching: .any)["fly-here"]
            XCTAssertTrue(flyHere.waitForExistence(timeout: 30), "no Fly Here the \(time) time")
            flyHere.tap()
            XCTAssertTrue(app.textFields["To"].waitForExistence(timeout: 20), "Fly Here did not show FPL the \(time) time")
            XCTAssertEqual(dots.value as? String, "Page 2 of 2, FPL", "Fly Here left the sheet on Search the \(time) time")
            XCTAssertEqual(app.textFields["To"].value as? String, "KOSH")
            if time == "first" {
                // Back to Search and the same field's card again.
                dots.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).tap()
                XCTAssertEqual(dots.value as? String, "Page 1 of 2, Search")
                let search = app.searchFields[CardTests.searchPrompt]
                XCTAssertTrue(search.waitForExistence(timeout: 10))
                search.tap()
                search.typeText("KOSH")
                let result = app.descendants(matching: .any)["airport-result-KOSH"]
                XCTAssertTrue(result.waitForExistence(timeout: 30), "KOSH was not found")
                result.tap()
            }
        }
    }

    @MainActor
    func testACardOpenedOverSearchClosesBackToSearch() throws {
        let app = launch()
        let fuel = app.buttons["find-nearby-fuel"]
        CardTests.scrollTo(fuel, in: app)
        fuel.tap()
        let close = CardTests.close(app)
        XCTAssertTrue(close.waitForExistence(timeout: 10), "the Stops did not open")
        close.tap()
        XCTAssertEqual(dots(app).value as? String, "Page 1 of 2, Search", "the Stops' close did not come back to Search")
    }

    @MainActor
    func testLeavingSearchPutsTheKeyboardAway() throws {
        let app = launch()
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(search.waitForExistence(timeout: 20))
        search.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10), "the search field is not focused")
        dots(app).coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertEqual(dots(app).value as? String, "Page 2 of 2, FPL")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "the keyboard stayed up on FPL")
    }

    @MainActor
    func testTheFirstFlightRidesTheSheetUntilPutAway() throws {
        let app = CardTests.launch(["-screen", "search", "-firstFlight"], size: [])
        let card = app.descendants(matching: .any)["first-flight"]
        XCTAssertTrue(card.waitForExistence(timeout: 20), "no first flight with no route")
        XCTAssertTrue(app.buttons["first-flight-plan"].exists, "no Plan It")
        XCTAssertFalse(app.buttons["first-flight-plan"].isEnabled, "Plan It with no destination")
        app.buttons["first-flight-close"].tap()
        XCTAssertTrue(card.waitForNonExistence(timeout: 5), "Not Now did not put the first flight away")
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
            CardTests.dragDown(grabber, in: app)
            CardTests.settled(dots)
            XCTAssertGreaterThan(dots.frame.minY, half + 100, "the sheet did not come down on \(page)")
            XCTAssertTrue(dots.isHittable, "the dots are gone at the pill on \(page)")
            // Back up to half: dragged to where the dots were.
            let halfway = CGVector(dx: 0.5, dy: app.frame.height > 0 ? half / app.frame.height : 0.5)
            CardTests.drag(grabber, in: app, to: halfway)
            CardTests.settled(dots)
            XCTAssertEqual(dots.frame.minY, half, accuracy: 8, "the sheet did not go back up on \(page)")
            CardTests.dragSideways(app.descendants(matching: .any)["sheet-pager"], in: app, left: true)
        }
    }
}
