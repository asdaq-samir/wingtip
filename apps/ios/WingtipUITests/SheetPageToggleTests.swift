import XCTest

/// The plan's sheet's two pages, Search and FPL, turned by the one round
/// toggle on the map under the 3D (the owner, 2026-11-13;
/// docs/design/rules.md §4), where the pager's dots and swipe were: the
/// toggle names where it goes and turns the page, FPL with no route is
/// the route box empty whose close goes back to Search, Fly Here from a
/// field's card lands on FPL (twice to the same field too), a card opened
/// over Search closes back to Search, leaving Search puts the keyboard
/// away, the toggle over a card closes it, an up or down drag still sizes
/// the sheet on either page, and the
/// first launch's welcome goes on to Search asking for the destination.
/// Offline, but for Fly Here, whose card needs the planner (PlannerHost).
final class SheetPageToggleTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    private func launch() -> XCUIApplication {
        CardTests.launch(["-screen", "search"], size: [])
    }

    @MainActor
    private func toggle(_ app: XCUIApplication) -> XCUIElement {
        app.buttons["sheet-page-toggle"]
    }

    @MainActor
    func testTheToggleTurnsThePagesAndSaysWhereItGoes() throws {
        let app = launch()
        let toggle = toggle(app)
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(toggle.waitForExistence(timeout: 20), "no page toggle")
        XCTAssertTrue(search.waitForExistence(timeout: 20), "the sheet did not open on Search")
        XCTAssertEqual(toggle.label, "Show flight plan")
        XCTAssertFalse(app.descendants(matching: .any)["sheet-page-dots"].exists, "the page dots are still drawn")

        toggle.tap()
        XCTAssertTrue(app.textFields["To"].waitForExistence(timeout: 10), "the toggle did not go to FPL")
        XCTAssertEqual(toggle.label, "Show search")
        XCTAssertFalse(search.exists && search.isHittable, "the search's row is still on the FPL page")

        toggle.tap()
        XCTAssertTrue(search.waitForExistence(timeout: 10) && search.isHittable, "the toggle did not come back to Search")
        // Its tap area the map buttons' own, under the 3D at the left.
        XCTAssertGreaterThanOrEqual(toggle.frame.width, 44)
        let threeD = app.buttons["map-3d"]
        XCTAssertTrue(threeD.exists, "no 3D button")
        XCTAssertLessThan(threeD.frame.maxY, toggle.frame.minY, "the toggle is not under the 3D")
        XCTAssertLessThan(toggle.frame.midX, app.frame.width / 2, "the toggle is not at the left")
    }

    @MainActor
    func testTheEmptyRoutesCloseGoesBackToSearch() throws {
        let app = launch()
        let toggle = toggle(app)
        XCTAssertTrue(toggle.waitForExistence(timeout: 20), "no page toggle")
        toggle.tap()
        XCTAssertTrue(app.textFields["To"].waitForExistence(timeout: 10), "the toggle did not go to FPL")
        let close = app.buttons["route-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 10), "no close on the empty route box")
        close.tap()
        XCTAssertEqual(toggle.label, "Show flight plan", "the empty box's close did not go back to Search")
    }

    @MainActor
    func testShowRouteAsIsInTheEmptyRoutesMenu() throws {
        let app = launch()
        toggle(app).tap()
        let more = app.buttons["route-more"]
        XCTAssertTrue(more.waitForExistence(timeout: 10), "no ••• on the empty route box")
        more.tap()
        XCTAssertTrue(app.buttons["Route Box"].waitForExistence(timeout: 5), "no Show Route As in the menu")
        XCTAssertTrue(app.buttons["Strip"].exists)
        XCTAssertFalse(app.buttons["Clear Route"].exists, "Clear Route with no route")
    }

    @MainActor
    func testFlyHereLandsOnFplEvenToTheSameFieldAgain() async throws {
        // The field's card, and so its Fly Here, is the planner's answer:
        // with no planner the card shows only that it could not be had.
        try await PlannerHost.skipWithoutAddress()
        let app = CardTests.launch(["-card", "@KOSH"], size: [])
        let toggle = toggle(app)
        for time in ["first", "second"] {
            let flyHere = app.descendants(matching: .any)["fly-here"]
            XCTAssertTrue(flyHere.waitForExistence(timeout: 30), "no Fly Here the \(time) time")
            flyHere.tap()
            XCTAssertTrue(app.textFields["To"].waitForExistence(timeout: 20), "Fly Here did not show FPL the \(time) time")
            XCTAssertEqual(toggle.label, "Show search", "Fly Here left the sheet on Search the \(time) time")
            XCTAssertEqual(app.textFields["To"].value as? String, "KOSH")
            if time == "first" {
                // Back to Search and the same field's card again.
                toggle.tap()
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
        XCTAssertEqual(toggle(app).label, "Show flight plan", "the Stops' close did not come back to Search")
    }

    /// The toggle stays in sight over a card at half, and a tap closes the
    /// card and turns the sheet (the owner, 2026-11-13).
    @MainActor
    func testTheToggleStaysOverACardAndClosesIt() throws {
        let app = CardTests.launch(["-card", "+map"], size: [])
        let card = CardTests.card(app, "card-map")
        XCTAssertTrue(card.waitForExistence(timeout: 20), "the Map card did not open")
        let toggle = toggle(app)
        XCTAssertTrue(toggle.waitForExistence(timeout: 10), "no page toggle over the card")
        CardTests.settled(toggle)
        XCTAssertTrue(toggle.isHittable, "the toggle is out of reach over the card")
        XCTAssertEqual(toggle.label, "Show flight plan")
        toggle.tap()
        XCTAssertTrue(card.waitForNonExistence(timeout: 10), "the toggle did not close the card")
        XCTAssertTrue(app.textFields["To"].waitForExistence(timeout: 10), "the toggle did not turn the sheet to FPL")
        XCTAssertEqual(toggle.label, "Show search")
    }

    @MainActor
    func testLeavingSearchPutsTheKeyboardAway() throws {
        let app = launch()
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(search.waitForExistence(timeout: 20))
        // At the pill the toggle rides the sheet; the search's own field up
        // takes the sheet all the way, where the map's buttons give way, so
        // the toggle is reached once the keyboard is down again.
        search.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10), "the search field is not focused")
        app.buttons["Cancel"].firstMatch.tap()
        toggle(app).tap()
        XCTAssertEqual(toggle(app).label, "Show search")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "the keyboard stayed up on FPL")
    }

    @MainActor
    func testTheWelcomeGoesOnToSearchAskingForTheDestination() throws {
        let app = CardTests.launch(["-screen", "search", "-firstFlight"], size: [])
        let welcome = app.descendants(matching: .any)["welcome"]
        XCTAssertTrue(welcome.waitForExistence(timeout: 20), "no welcome with no route")
        XCTAssertTrue(app.staticTexts["Welcome to Wingtip Maps"].exists)
        XCTAssertTrue(app.buttons["theme-select"].exists || app.otherElements["theme-select"].exists, "no Theme on the welcome")
        let later = app.buttons["welcome-later"]
        let go = app.buttons["welcome-go"]
        XCTAssertTrue(later.exists || go.exists, "no way on from the welcome")
        (later.exists ? later : go).tap()
        XCTAssertTrue(welcome.waitForNonExistence(timeout: 5), "the welcome stayed up")
        XCTAssertTrue(app.searchFields["Where are you flying to?"].waitForExistence(timeout: 10), "the search did not ask for the destination")
        XCTAssertFalse(app.keyboards.firstMatch.exists, "the keyboard came up before a tap")
    }

    @MainActor
    func testAnUpOrDownDragStillSizesTheSheetOnBothPages() throws {
        let app = launch()
        let grabber = CardTests.grabber(app)
        let toggle = toggle(app)
        XCTAssertTrue(toggle.waitForExistence(timeout: 20), "no page toggle")
        for page in ["Search", "FPL"] {
            CardTests.settled(toggle)
            let half = toggle.frame.minY
            // The sheet's top at half: the map's buttons ride 24 over it.
            let top = toggle.frame.maxY + 24
            CardTests.dragDown(grabber, in: app)
            CardTests.settled(toggle)
            XCTAssertGreaterThan(toggle.frame.minY, half + 100, "the sheet did not come down on \(page)")
            XCTAssertTrue(toggle.isHittable, "the toggle is gone at the pill on \(page)")
            // Back up to half: the grabber dragged to where the top was.
            let halfway = CGVector(dx: 0.5, dy: app.frame.height > 0 ? top / app.frame.height : 0.5)
            CardTests.drag(grabber, in: app, to: halfway)
            CardTests.settled(toggle)
            XCTAssertEqual(toggle.frame.minY, half, accuracy: 8, "the sheet did not go back up on \(page)")
            toggle.tap()
        }
    }
}
