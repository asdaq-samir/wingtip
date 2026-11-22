import XCTest

/// The iPad's own layout and inputs (docs/design/ios.md §16; the owner,
/// 2026-11-21: "Primary app users are on iPad"), one test each, on the
/// iPad simulator after merge (scripts/ci/ios_test.sh) and every night:
/// the sidebar put away and brought back, the menu bar's keys, and a card
/// in a window too narrow for the sidebar beside it. Skipped on the iPhone,
/// whose sheet has no sidebar.
final class IPadLayoutTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        // XCTest sets up on the main thread, where the device is read.
        if !MainActor.assumeIsolated({ CardTests.split }) { throw XCTSkip("The iPad's layout: an iPhone has no sidebar") }
    }

    /// Hide Sidebar, then the system's Show Sidebar over the map brings it
    /// back: with the map's bar hidden for good, a pilot who hid the
    /// sidebar had no way back to the plan and the search on the screen.
    @MainActor
    func testAHiddenSidebarComesBack() throws {
        let app = CardTests.launch(["-screen", "search"], size: [])
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(search.waitForExistence(timeout: 20) && search.isHittable, "no search in the sidebar")
        let hide = app.buttons["Hide Sidebar"].firstMatch
        XCTAssertTrue(hide.waitForExistence(timeout: 10), "no Hide Sidebar")
        hide.tap()
        XCTAssertTrue(search.waitForHittable(false, timeout: 10), "the sidebar did not go")
        let show = app.buttons["Show Sidebar"].firstMatch
        XCTAssertTrue(show.waitForExistence(timeout: 10) && show.isHittable, "no Show Sidebar with the sidebar put away")
        show.tap()
        XCTAssertTrue(search.waitForHittable(true, timeout: 10), "Show Sidebar did not bring the search back")
        app.terminate()
    }

    /// ⌘B opens the Brief and ⌘F the one search, the sidebar brought back
    /// for it: the menu bar's commands (WingtipCommands) by their keys.
    @MainActor
    func testTheMenuBarsKeysOpenTheBriefAndTheSearch() throws {
        let app = CardTests.launch(["-screen", "search"], size: [])
        let search = app.searchFields[CardTests.searchPrompt]
        XCTAssertTrue(search.waitForExistence(timeout: 20), "no search in the sidebar")
        app.buttons["Hide Sidebar"].firstMatch.tap()
        XCTAssertTrue(search.waitForHittable(false, timeout: 10), "the sidebar did not go")
        app.typeKey("f", modifierFlags: .command)
        XCTAssertTrue(search.waitForHittable(true, timeout: 10), "⌘F did not bring the sidebar and its search back")
        app.typeKey("b", modifierFlags: .command)
        XCTAssertTrue(CardTests.card(app, "card-brief").waitForExistence(timeout: 10), "⌘B did not open the Brief")
        app.terminate()
    }

    /// A field's card beside the map: where the window has the width the
    /// sidebar stays; where it has not (an iPad held upright), the sidebar
    /// gives way while the card is up, and comes back with its close, so
    /// the map always keeps a phone's width (SplitRoom).
    @MainActor
    func testACardKeepsTheMapInSight() throws {
        let app = CardTests.open(.card("@KOSH"), size: [])
        let card = CardTests.card(app, "card-airport")
        XCTAssertTrue(card.waitForExistence(timeout: 20), "the airport card did not open")
        let search = app.searchFields[CardTests.searchPrompt]
        let roomy = app.frame.width >= 1125
        XCTAssertTrue(search.waitForHittable(roomy, timeout: 10), roomy ? "the sidebar went with room for it" : "the sidebar stayed with no room for the map")
        let map = app.frame.width - card.frame.width - (roomy ? search.frame.maxX : 0)
        XCTAssertGreaterThanOrEqual(map, 320, "the map is \(map) points wide between the sidebar and the card")
        CardTests.close(app).tap()
        XCTAssertTrue(card.waitForNonExistence(timeout: 10), "the close did not put the card away")
        XCTAssertTrue(search.waitForHittable(true, timeout: 10), "the sidebar did not come back with the card closed")
        app.terminate()
    }
}

private extension XCUIElement {
    /// Whether the element comes to be in reach, or out of it, in time:
    /// looked at four times a second on the main actor, as XCUIElement is.
    @MainActor
    func waitForHittable(_ hittable: Bool, timeout: TimeInterval) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if (exists && isHittable) == hittable { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return (exists && isHittable) == hittable
    }
}
