import XCTest

/// The card rule (the owner, 2026-11-10), opened and closed for every card
/// in CardTests.cards by every way in, at the default text size and at
/// accessibility XXL: the same card by its handle whichever way it came,
/// the search out of sight while it is up, its close at the right putting
/// it away back to the plan, a page opened inside a card going Back to
/// the card, every card opening half way but the emergency assistant,
/// which opens as a card at full height with its close at the top right,
/// and You signed out saying Sign In once.
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
                    // Every card opens half way (the card rule's 2).
                    let grabber = CardTests.grabber(app)
                    if grabber.waitForExistence(timeout: 5) {
                        CardTests.settled(grabber)
                        XCTAssertNotEqual(grabber.value as? String, "Expanded", "\(context): it did not open half way")
                    }
                    // The card covers the search, as Maps' place card does.
                    let search = app.searchFields[CardTests.searchPrompt]
                    XCTAssertFalse(search.exists && search.isHittable, "\(context): the search is still in reach")
                    if case .youRow = entry {
                        // Opened inside You: Back goes to You, not the map.
                        app.navigationBars.buttons.element(boundBy: 0).tap()
                        XCTAssertTrue(CardTests.card(app, "card-setup").waitForExistence(timeout: 10), "\(context): Back did not go to You")
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

    /// A page opened inside a card stays in that card: Settings pushed from
    /// You's gear, its Downloads row pushed with Back, one Back returning to
    /// Settings and one more to You; the Map card's gear opens the same
    /// Settings, its Back returning to the Map card.
    @MainActor
    func testAPageOpenedInACardGoesBackToTheCard() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-screen", "setup"], size: size.arguments)
            XCTAssertTrue(CardTests.card(app, "card-setup").waitForExistence(timeout: 20), "You did not open at \(size.name)")
            let gear = app.buttons["settings-gear"]
            XCTAssertTrue(gear.exists, "no gear on You at \(size.name)")
            XCTAssertLessThan(gear.frame.midX, app.frame.midX, "You's gear is not at the left at \(size.name)")
            gear.tap()
            XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10), "the gear did not open Settings at \(size.name)")
            let row = app.buttons["Downloads"].firstMatch
            CardTests.scrollTo(row, in: app)
            row.tap()
            XCTAssertTrue(app.navigationBars["Downloads"].waitForExistence(timeout: 10), "Downloads did not push at \(size.name)")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10), "one Back did not return to Settings at \(size.name)")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.buttons["you-sign-in"].waitForExistence(timeout: 10), "Back did not return to You at \(size.name)")
            app.terminate()

            let map = CardTests.launch(["-card", "+map"], size: size.arguments)
            XCTAssertTrue(CardTests.card(map, "card-map").waitForExistence(timeout: 20), "the Map card did not open at \(size.name)")
            map.buttons["settings-gear"].tap()
            XCTAssertTrue(map.navigationBars["Settings"].waitForExistence(timeout: 10), "the Map card's gear did not open Settings at \(size.name)")
            XCTAssertTrue(map.buttons["airport-weather-look"].waitForExistence(timeout: 10), "Settings did not open at its Map group at \(size.name)")
            map.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(map.navigationBars["Map"].waitForExistence(timeout: 10), "Back did not return to the Map card at \(size.name)")
            map.terminate()
        }
    }

    /// The emergency assistant is a card like every other, the one that
    /// opens at full height, its close at the top right where every card's
    /// is (the owner, 2026-11-13).
    @MainActor
    func testTheEmergencyAssistantIsACardOpenedAtFullHeight() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-screen", "emergency"], size: size.arguments)
            let shown = CardTests.card(app, "card-emergency")
            XCTAssertTrue(shown.waitForExistence(timeout: 20), "the emergency assistant did not open at \(size.name)")
            let grabber = CardTests.grabber(app)
            XCTAssertTrue(grabber.waitForExistence(timeout: 10), "the emergency assistant is not on a sheet at \(size.name)")
            CardTests.settled(grabber)
            XCTAssertEqual(grabber.value as? String, "Expanded", "the emergency assistant did not open at full height at \(size.name)")
            let close = CardTests.close(app)
            XCTAssertTrue(close.waitForExistence(timeout: 10), "no close at \(size.name)")
            XCTAssertGreaterThan(close.frame.midX, app.frame.midX, "the close is not at the right at \(size.name)")
            XCTAssertLessThan(close.frame.midY, app.frame.height / 4, "the close is not at the top at \(size.name)")
            close.tap()
            XCTAssertTrue(shown.waitForNonExistence(timeout: 10), "the close did not put it away at \(size.name)")
            app.terminate()
        }
    }

    /// Signed out, You says it once (the owner, 2026-11-13): Sign In is the
    /// head's large line, no "You" in the bar, and the rows that need an
    /// account are there but disabled, with no words of their own.
    @MainActor
    func testYouSignedOutSaysSignInOnce() throws {
        let app = CardTests.launch(["-screen", "setup"], size: [])
        XCTAssertTrue(CardTests.card(app, "card-setup").waitForExistence(timeout: 20), "You did not open")
        let signIn = app.buttons["you-sign-in"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 10), "no Sign In in You's head")
        XCTAssertFalse(app.navigationBars.staticTexts["You"].exists, "the bar still says You")
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'sign in'")).count, 0,
                       "a line besides the head's button says to sign in")
        for row in ["pilot-details-row", "logbook-row"] {
            let element = app.buttons[row].firstMatch
            CardTests.scrollTo(element, in: app)
            XCTAssertTrue(element.exists, "no \(row) signed out")
            XCTAssertFalse(element.isEnabled, "\(row) is enabled signed out")
        }
    }
}
