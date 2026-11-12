import XCTest

/// The card rule (the owner, 2026-11-10), opened and closed for every card
/// in CardTests.cards by every way in, at the default text size and at
/// accessibility XXL: the same card by its handle whichever way it came,
/// the search out of sight while it is up, its close at the right putting
/// it away back to the plan, a page opened inside a card going Back to
/// the card, and the emergency assistant full screen with its close at
/// the top right.
final class CardRuleTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testEveryCardOpensAndClosesTheSameWayFromEveryWayIn() throws {
        for size in CardTests.sizes {
            for card in CardTests.cards {
                for entry in card.entries {
                    let context = "\(card.name) from \(entry) at \(size.name)"
                    let app = CardTests.open(entry, size: size.arguments)
                    let shown = CardTests.card(app, card.id)
                    XCTAssertTrue(shown.waitForExistence(timeout: 20), "\(context): \(card.id) did not open")
                    // The card covers the search, as Maps' place card does.
                    let search = app.searchFields[CardTests.searchPrompt]
                    XCTAssertFalse(search.exists && search.isHittable, "\(context): the search is still in reach")
                    if case .settingsRow = entry {
                        // Opened inside Settings: Back goes to Settings, not the map.
                        app.navigationBars.buttons.element(boundBy: 0).tap()
                        XCTAssertTrue(CardTests.card(app, "card-setup").waitForExistence(timeout: 10), "\(context): Back did not go to Settings")
                    } else {
                        let close = CardTests.close(app)
                        XCTAssertTrue(close.waitForExistence(timeout: 10), "\(context): no close")
                        XCTAssertGreaterThan(close.frame.midX, app.frame.midX, "\(context): the close is not at the right")
                        close.tap()
                        XCTAssertTrue(shown.waitForNonExistence(timeout: 10), "\(context): the close did not put it away")
                        XCTAssertTrue(search.waitForExistence(timeout: 10), "\(context): the plan's search did not come back")
                    }
                    app.terminate()
                }
            }
        }
    }

    /// A page opened inside a card stays in that card: Settings' Downloads
    /// row pushed with Back, one Back returning to Settings.
    @MainActor
    func testAPageOpenedInACardGoesBackToTheCard() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-screen", "setup"], size: size.arguments)
            XCTAssertTrue(CardTests.card(app, "card-setup").waitForExistence(timeout: 20), "Settings did not open at \(size.name)")
            let row = app.buttons["Downloads"].firstMatch
            CardTests.scrollTo(row, in: app)
            row.tap()
            XCTAssertTrue(app.navigationBars["Downloads"].waitForExistence(timeout: 10), "Downloads did not push at \(size.name)")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10), "one Back did not return to Settings at \(size.name)")
            app.terminate()
        }
    }

    /// Only the emergency assistant is full screen, its close at the top
    /// right where iOS puts the system's close.
    @MainActor
    func testTheEmergencyAssistantIsFullScreenWithItsCloseAtTheRight() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-screen", "emergency"], size: size.arguments)
            let shown = CardTests.card(app, "card-emergency")
            XCTAssertTrue(shown.waitForExistence(timeout: 20), "the emergency assistant did not open at \(size.name)")
            // Out of reach: a tap where the sheet's grabber is lands on the
            // cover, so the sheet keeps its size and the assistant stays.
            // (isHittable cannot say so: it answers for the grabber in the
            // window under the cover, as if nothing were over it.)
            let grabber = app.buttons.matching(identifier: "Sheet Grabber").firstMatch
            if grabber.exists {
                let detent = grabber.value as? String
                grabber.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                XCTAssertTrue(shown.exists, "a tap on the sheet's grabber put the emergency assistant away at \(size.name)")
                XCTAssertEqual(grabber.value as? String, detent, "a sheet's grabber is in reach over the emergency assistant at \(size.name)")
            }
            let close = CardTests.close(app)
            XCTAssertTrue(close.waitForExistence(timeout: 10), "no close at \(size.name)")
            XCTAssertGreaterThan(close.frame.midX, app.frame.midX, "the close is not at the right at \(size.name)")
            XCTAssertLessThan(close.frame.midY, app.frame.height / 4, "the close is not at the top at \(size.name)")
            close.tap()
            XCTAssertTrue(shown.waitForNonExistence(timeout: 10), "the close did not put it away at \(size.name)")
            app.terminate()
        }
    }
}
