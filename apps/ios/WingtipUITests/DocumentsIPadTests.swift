import XCTest

/// The documents library on the iPad, the primary device (the owner,
/// 2026-11-21): You's Documents page with the pilot's own PDF on it, the
/// reader over the window, its Contents in the inspector beside the page,
/// a bookmark, and the hardware keyboard's ⌘F, ⌘[ and ⌘]. The PDF is
/// made on the device (`-sample-document`, SampleDocument), so no planner
/// is needed; the FAA's shelf may be unreachable on the runner, which the
/// page says and these steps do not need. Run on the iPad at night with
/// every UI class; the keyboard's steps skipped on an iPhone.
final class DocumentsIPadTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func openReader() -> XCUIApplication {
        let app = CardTests.launch(["-screen", "documents", "-sample-document"], size: [])
        let row = app.buttons["own-document"].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 20), "the sample document is not among Your Documents")
        XCTAssertTrue(app.buttons["documents-add"].exists, "no Add a PDF")
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["reader-pdf"].waitForExistence(timeout: 15), "the reader did not open the PDF")
        return app
    }

    /// Contents opens beside the page (the inspector) and a heading tapped
    /// goes to its page; Bookmark This Page puts that page among the
    /// bookmarks under its heading.
    @MainActor
    func testContentsAndABookmark() throws {
        let app = openReader()
        app.buttons["reader-contents"].firstMatch.tap()
        let heading = app.buttons["7-1-5. Preflight Briefings"].firstMatch
        XCTAssertTrue(heading.waitForExistence(timeout: 10), "the outline is not in Contents")
        heading.tap()
        let bookmark = app.buttons["reader-bookmark"].firstMatch
        XCTAssertTrue(bookmark.waitForExistence(timeout: 5))
        bookmark.tap()
        if !CardTests.split {
            // On an iPhone Contents is a sheet, gone with the row's tap.
            app.buttons["reader-contents"].firstMatch.tap()
        }
        app.buttons["Bookmarks"].firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any)["reader-bookmarks"].waitForExistence(timeout: 5), "no bookmarks listed")
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Preflight Briefings")).firstMatch.exists,
                      "the bookmark is not named for its heading")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "reader with contents"
        shot.lifetime = .keepAlways
        add(shot)
        app.terminate()
    }

    /// ⌘F puts the search up and finds in the document; ⌘[ goes back to
    /// where the match was jumped from and ⌘] forward again.
    @MainActor
    func testTheKeyboardsFindBackAndForward() throws {
        if !CardTests.split { throw XCTSkip("A hardware keyboard's keys: the iPad's") }
        let app = openReader()
        app.typeKey("f", modifierFlags: .command)
        let search = app.searchFields["Search This Document"].firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10), "⌘F did not put the reader's search up")
        search.typeText("Inflight")
        let matches = app.staticTexts["reader-matches"].firstMatch
        XCTAssertTrue(matches.waitForExistence(timeout: 10), "no matches counted")
        XCTAssertTrue(NSPredicate(format: "label == %@", "1 of 1").evaluate(with: matches) || matches.label.hasPrefix("1 of"), "the match was not found: \(matches.label)")
        let back = app.buttons["reader-back"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        app.typeKey("[", modifierFlags: .command)
        XCTAssertTrue(app.buttons["reader-forward"].firstMatch.waitForExistence(timeout: 5))
        app.typeKey("]", modifierFlags: .command)
        app.terminate()
    }

    /// The reader's close puts it away, the library under it as it was.
    @MainActor
    func testTheReaderClosesBackToTheLibrary() throws {
        let app = openReader()
        app.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.buttons["own-document"].firstMatch.waitForExistence(timeout: 10), "the library is not back under the reader")
        app.terminate()
    }
}
