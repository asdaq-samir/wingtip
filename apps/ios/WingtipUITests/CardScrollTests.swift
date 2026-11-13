import XCTest

/// The scrolling rule (the owner, 2026-11-10), at the default text size
/// and at accessibility XXL: a card's title and close stay in sight with
/// its body scrolled to the end; at half height a drag up grows the card
/// before its rows move, and at full a drag down from the top lowers it;
/// the last row is reached and tapped; Back returns to where the list was
/// and a card opened afresh starts at its top; and a form with an edit
/// asks before it is thrown away. The sheet's height is read off its
/// grabber's value, as the accessibility audit reads it. Sideways rows
/// (the airport card's pictures, the route's pills) need the planner's
/// answers and are left to the flows that have them.
final class CardScrollTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    /// The long cards: their head pinned after the body is scrolled through.
    @MainActor
    func testTheTitleAndCloseStayInSightScrolledToTheEnd() throws {
        for size in CardTests.sizes {
            // You signed out has no title in its bar, its gear stands for it.
            for (entry, id, title) in [(CardTests.Entry.link("setup"), "card-setup", nil), (.card("+map"), "card-map", "Map")] {
                let context = "\(title ?? "You") at \(size.name)"
                let app = CardTests.open(entry, size: size.arguments)
                XCTAssertTrue(CardTests.card(app, id).waitForExistence(timeout: 20), "\(context): did not open")
                for _ in 0..<8 { app.swipeUp() }
                let close = CardTests.close(app)
                XCTAssertTrue(close.exists && close.isHittable, "\(context): the close scrolled away")
                if let title {
                    XCTAssertTrue(app.navigationBars[title].exists, "\(context): the title left the bar")
                } else {
                    XCTAssertTrue(app.buttons["settings-gear"].isHittable, "\(context): the gear left the bar")
                }
                app.terminate()
            }
        }
    }

    /// At half a drag up grows the card first, its first row where it was;
    /// at full a drag down from the top lowers it.
    @MainActor
    func testADragGrowsAndLowersTheCardBeforeItScrolls() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-card", "+map"], size: size.arguments)
            let card = CardTests.card(app, "card-map")
            XCTAssertTrue(card.waitForExistence(timeout: 20), "the Map card did not open at \(size.name)")
            let grabber = CardTests.grabber(app)
            XCTAssertTrue(grabber.waitForExistence(timeout: 10), "no grabber at \(size.name)")
            CardTests.settled(grabber)
            XCTAssertNotEqual(grabber.value as? String, "Expanded", "the Map card did not open half way at \(size.name)")
            let title = app.navigationBars["Map"]
            let firstRow = app.descendants(matching: .any)["layer-traffic"]
            let rowY = firstRow.frame.minY - title.frame.minY
            card.swipeUp()
            CardTests.settled(grabber)
            XCTAssertEqual(grabber.value as? String, "Expanded", "a drag up did not grow the card at \(size.name)")
            XCTAssertEqual(firstRow.frame.minY - title.frame.minY, rowY, accuracy: 60, "the rows scrolled before the card grew at \(size.name)")
            title.swipeDown()
            CardTests.settled(grabber)
            XCTAssertNotEqual(grabber.value as? String, "Expanded", "a drag down at the top did not lower the card at \(size.name)")
            app.terminate()
        }
    }

    /// Settings' last row, pushed from You's gear, reached and tapped; Back
    /// returns to it in place, and You opened afresh starts at its top.
    @MainActor
    func testTheLastRowIsReachedAndTheListKeepsItsPlace() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-screen", "setup"], size: size.arguments)
            XCTAssertTrue(CardTests.card(app, "card-setup").waitForExistence(timeout: 20), "You did not open at \(size.name)")
            app.buttons["settings-gear"].tap()
            XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10), "the gear did not open Settings at \(size.name)")
            let help = app.buttons["help-row"].firstMatch
            CardTests.scrollTo(help, in: app)
            let at = help.frame.minY
            help.tap()
            XCTAssertTrue(app.navigationBars["Help & About"].waitForExistence(timeout: 10), "Help & About did not open at \(size.name)")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(help.waitForExistence(timeout: 10) && help.isHittable, "Back lost the list's place at \(size.name)")
            XCTAssertEqual(help.frame.minY, at, accuracy: 4, "Back moved the list at \(size.name)")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            CardTests.close(app).tap()
            let account = app.buttons["account-button"]
            XCTAssertTrue(account.waitForExistence(timeout: 10), "no account button at \(size.name)")
            account.tap()
            let signIn = app.buttons["you-sign-in"]
            XCTAssertTrue(signIn.waitForExistence(timeout: 10) && signIn.isHittable,
                          "You opened again did not start at its top at \(size.name)")
            app.terminate()
        }
    }

    /// The clearance form with words typed: a swipe down keeps it, and
    /// Cancel asks first, its Keep Editing keeping the words.
    @MainActor
    func testAFormWithAnEditAsksBeforeItGoes() throws {
        for size in CardTests.sizes {
            let app = CardTests.launch(["-card", "+clearance"], size: size.arguments)
            let card = CardTests.card(app, "card-clearance")
            XCTAssertTrue(card.waitForExistence(timeout: 20), "the clearance did not open at \(size.name)")
            let field = app.textFields.firstMatch.exists ? app.textFields.firstMatch : app.textViews.firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 10), "no field to type in at \(size.name)")
            field.tap()
            field.typeText("CLEARED TO KOSH")
            app.navigationBars["Clearance"].swipeDown(velocity: .fast)
            app.navigationBars["Clearance"].swipeDown(velocity: .fast)
            XCTAssertTrue(card.exists, "a swipe threw the edit away at \(size.name)")
            app.navigationBars.buttons["Cancel"].tap()
            let asked = app.staticTexts["Discard your changes?"]
            XCTAssertTrue(asked.waitForExistence(timeout: 10), "Cancel did not ask at \(size.name)")
            XCTAssertTrue(app.buttons["Discard Changes"].exists, "the question has no Discard Changes at \(size.name)")
            // Keep Editing, the dialog's cancel: a button where the dialog
            // is an action sheet, and a tap outside it where iOS 26 shows
            // it as a popover from Cancel, which leaves its cancel out.
            let keep = app.buttons["Keep Editing"]
            // Outside it is the popover's own dismiss region (UIKit's
            // "dismiss popup"), at its middle, under the popover and above
            // the keyboard still up for the field being typed in.
            if keep.exists { keep.tap() } else { app.otherElements["PopoverDismissRegion"].tap() }
            XCTAssertTrue(asked.waitForNonExistence(timeout: 5), "Keep Editing did not put the question away at \(size.name)")
            XCTAssertTrue(card.exists, "Keep Editing put the form away at \(size.name)")
            // Once the pilot leaves the field, the words read as a clearance
            // fold into its Transcript, the field with them.
            if !field.exists { app.buttons["Transcript"].tap() }
            XCTAssertTrue((field.value as? String ?? "").contains("KOSH"), "Keep Editing lost the words at \(size.name)")
            app.terminate()
        }
    }
}
