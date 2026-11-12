import XCTest

/// The approach plate on the map, ForeFlight's way (the owner, 2026-11-11):
/// KATW to KOSH with the ILS to runway 36 picked, its whole plate drawn
/// round KOSH; a tap on the page opens its card, Hide Plate takes the
/// plate off the map and leaves the approach on the route. Against the
/// planner, as FlowTests are; each step kept as a screenshot, and written
/// to SHOTS_DIR where it is set.
final class PlateMapTests: XCTestCase {
    private static let planner: TimeInterval = 120

    /// The procedures and the plate are the planner's, so with no planner
    /// to ask this is skipped as FlowTests are (PlannerHost), not failed.
    override func setUp() async throws {
        try await super.setUp()
        continueAfterFailure = false
        try await PlannerHost.skipWithoutAddress()
    }

    @MainActor
    func testTappingThePlateOpensItsCardAndHideTakesItOff() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-layout", "plan", "-screen", "fpl", "-fresh", "-traffic", "<false/>"]
        app.launch()
        let from = app.textFields["From"]
        XCTAssertTrue(from.waitForExistence(timeout: 30), "no From field")
        from.tap()
        from.typeText("KATW")
        let to = app.textFields["To"]
        to.tap()
        to.typeText("KOSH")
        app.buttons["Plan"].tap()
        XCTAssertTrue(app.buttons["More"].waitForExistence(timeout: Self.planner), "the route did not come")

        // The approach into KOSH from the plan's Procedures menus.
        let approach = app.buttons["Approach"].firstMatch
        for _ in 0..<8 where !(approach.exists && approach.isHittable) { app.swipeUp() }
        XCTAssertTrue(approach.isHittable, "no Approach menu")
        approach.tap()
        let ils = app.buttons["ILS RWY 36"].firstMatch
        XCTAssertTrue(ils.waitForExistence(timeout: 10), "no ILS RWY 36 in the menu")
        ils.tap()
        let published = app.buttons["As published"].firstMatch
        if published.waitForExistence(timeout: 5) { published.tap() }

        // The sheet down to its pill, the map and the plate in sight.
        let grabber = app.buttons.matching(identifier: "Sheet Grabber").firstMatch
        if grabber.exists {
            grabber.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
        }
        sleep(10)
        keep(app, "plate-on-map")

        // West of the course, on the page's plan view.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.42)).tap()
        let card = app.descendants(matching: .any).matching(identifier: "card-plate").firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10), "a tap on the plate did not open its card")
        XCTAssertTrue(app.switches["Show Annotations"].exists, "no Show Annotations switch")
        XCTAssertTrue(app.switches["Invert Plate Colors"].exists, "no Invert Plate Colors switch")
        XCTAssertTrue(app.sliders.firstMatch.exists, "no transparency slider")
        sleep(2)
        keep(app, "plate-card")

        app.buttons["plate-hide"].tap()
        XCTAssertTrue(card.waitForNonExistence(timeout: 10), "Hide Plate did not put the card away")
        sleep(3)
        keep(app, "plate-hidden")
        // The page gone, a tap where it was opens no card.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.42)).tap()
        XCTAssertFalse(card.waitForExistence(timeout: 3), "the hidden plate still took the tap")
        app.terminate()
    }

    @MainActor
    private func keep(_ app: XCUIApplication, _ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"], !dir.isEmpty {
            try? shot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}
