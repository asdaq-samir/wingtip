import XCTest

/// The App Store's screenshots, taken from the app itself
/// (scripts/dev/store-shots.sh, docs/store/screenshots/README.md): the
/// route C81 to KDLH on the chart, its Brief and nav log, O'Hare's card
/// and the Downloads page, each written as a PNG into SHOTS_DIR for
/// scripts/build/store-frames.sh to frame. Skipped unless SHOTS_DIR is
/// set, so the suite's own runs never wait on it.
final class StoreShotsTests: XCTestCase {
    private static let planner: TimeInterval = 120
    private var dir: URL!

    override func setUpWithError() throws {
        guard let path = ProcessInfo.processInfo.environment["SHOTS_DIR"], !path.isEmpty else {
            throw XCTSkip("SHOTS_DIR is not set: no store screenshots asked for")
        }
        dir = URL(fileURLWithPath: path)
        continueAfterFailure = false
    }

    @MainActor
    private func launch(screen: String) -> XCUIApplication {
        let app = XCUIApplication()
        // Traffic off: the live airplanes round Chicago bury the chart.
        app.launchArguments += ["-layout", "plan", "-screen", screen, "-fresh", "-traffic", "<false/>"]
        app.launch()
        return app
    }

    @MainActor
    private func save(_ app: XCUIApplication, _ name: String, settle: TimeInterval = 4) {
        Thread.sleep(forTimeInterval: settle)
        let png = XCUIScreen.main.screenshot().pngRepresentation
        try? png.write(to: dir.appendingPathComponent("\(name).png"))
    }

    @MainActor
    private func plan(_ app: XCUIApplication) {
        let from = app.textFields["From"]
        XCTAssertTrue(from.waitForExistence(timeout: 30))
        from.tap()
        from.typeText("C81")
        let to = app.textFields["To"]
        to.tap()
        to.typeText("KDLH")
        app.buttons["Plan"].tap()
        XCTAssertTrue(app.buttons["More"].waitForExistence(timeout: Self.planner), "the route did not come")
    }

    @MainActor
    func testRouteBriefAndNavLog() throws {
        // An airplane first, by its N-number from the FAA's registry (the
        // one AircraftView's preview uses): with none the app assumes none
        // (docs/decisions/0011), and there is no nav log or verdict.
        let app = launch(screen: "airplane")
        let tail = app.textFields["N-number"]
        XCTAssertTrue(tail.waitForExistence(timeout: 30))
        tail.tap()
        tail.typeText("N3429J\n")
        Thread.sleep(forTimeInterval: 8)
        // The Airplane page left by the system's Back: the plan under it.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        plan(app)
        // The sheet drawn down to its lowest detent, so the chart and the
        // route over it fill the screen.
        let top = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.48))
        top.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
        save(app, "01-map", settle: 12)
        // And up again for the route card's Nav Log and Brief.
        let low = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.84))
        low.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)))
        Thread.sleep(forTimeInterval: 2)
        let item = app.buttons["Nav Log"]
        XCTAssertTrue(item.waitForExistence(timeout: Self.planner))
        item.tap()
        let navLog = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Nav Log'")).firstMatch
        XCTAssertTrue(navLog.waitForExistence(timeout: Self.planner))
        save(app, "03-navlog", settle: 8)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        Thread.sleep(forTimeInterval: 2)
        let brief = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Brief'")).firstMatch
        XCTAssertTrue(brief.waitForExistence(timeout: Self.planner))
        brief.tap()
        XCTAssertTrue(app.navigationBars["Brief"].waitForExistence(timeout: Self.planner))
        // Until the verdict is in, not its "Checking the flight…".
        let checking = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Checking the flight'")).firstMatch
        _ = checking.waitForNonExistence(timeout: Self.planner)
        // With no airplane picked the app assumes none (docs/decisions/0011)
        // and the Brief has no verdict to show: no picture of that.
        let noAirplane = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'aircraft profile'")).firstMatch
        if !noAirplane.exists { save(app, "02-brief", settle: 8) }
    }

    @MainActor
    func testAirportCard() throws {
        let app = launch(screen: "airport")
        let search = app.searchFields["Search airports, airplanes, or ask"]
        XCTAssertTrue(search.waitForExistence(timeout: 30))
        search.tap()
        search.typeText("KORD")
        let result = app.descendants(matching: .any)["airport-result-KORD"]
        XCTAssertTrue(result.waitForExistence(timeout: Self.planner))
        result.tap()
        XCTAssertTrue(app.descendants(matching: .any)["airport-card-head"].waitForExistence(timeout: Self.planner))
        save(app, "04-airport", settle: 12)
    }

    @MainActor
    func testDownloads() throws {
        // Downloads is a page of Settings now (Data); its own link opens it.
        let app = launch(screen: "downloads")
        XCTAssertTrue(app.navigationBars["Downloads"].waitForExistence(timeout: 30))
        save(app, "05-downloads", settle: 8)
    }
}
