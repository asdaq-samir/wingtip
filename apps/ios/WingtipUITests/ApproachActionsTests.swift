import XCTest

/// An approach's own actions from its head row on FPL's line
/// (ApproachMenuItems, docs/navigation.md "An approach"): KATW to KOSH
/// with the ILS to runway 36 picked from KOSH's "+ APCH", then its head's
/// menu opens the Approach Brief, the Dry Run a step at a time, and the
/// plate's card. Against the planner, as PlateMapTests are, and skipped
/// with no planner to ask.
final class ApproachActionsTests: XCTestCase {
    private static let planner: TimeInterval = 120

    override func setUp() async throws {
        try await super.setUp()
        continueAfterFailure = false
        try await PlannerHost.skipWithoutAddress()
    }

    @MainActor
    func testAnApproachOnTheLineIsBriefedFlownDryAndItsPlateOpened() throws {
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

        let approach = app.buttons["add-approach-KOSH"].firstMatch
        XCTAssertTrue(approach.waitForExistence(timeout: Self.planner), "no + APCH on KOSH's line")
        for _ in 0..<8 where !(approach.exists && approach.isHittable) { app.swipeUp() }
        approach.tap()
        let ils = app.buttons["ILS RWY 36"].firstMatch
        XCTAssertTrue(ils.waitForExistence(timeout: 10), "no ILS RWY 36 in the menu")
        ils.tap()
        let published = app.buttons["As published"].firstMatch
        if published.waitForExistence(timeout: 5) { published.tap() }

        // The head's menu: the brief.
        let head = app.buttons["procedure-head-approach"].firstMatch
        XCTAssertTrue(head.waitForExistence(timeout: Self.planner), "no approach head on the line")
        head.tap()
        let brief = app.buttons["Approach Brief"].firstMatch
        XCTAssertTrue(brief.waitForExistence(timeout: 5), "no Approach Brief in the head's menu")
        brief.tap()
        let lesson = app.descendants(matching: .any)["approach-lesson"].firstMatch
        XCTAssertTrue(lesson.waitForExistence(timeout: 30), "the approach's sheet did not open")

        // Its dry run, a step at a time.
        app.segmentedControls["approach-lesson-steps"].buttons["Dry Run"].tap()
        let step = app.descendants(matching: .any)["approach-lesson-step"].firstMatch
        XCTAssertTrue(step.waitForExistence(timeout: 30), "the dry run shows no step")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Step 1 of'")).firstMatch.exists,
                      "the dry run does not start at its first step")
        app.buttons["Next"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Step 2 of'")).firstMatch.waitForExistence(timeout: 5),
                      "Next did not move the dry run on")
        app.buttons["Done"].tap()
        XCTAssertTrue(lesson.waitForNonExistence(timeout: 10), "Done did not put the sheet away")

        // The plate's card.
        head.tap()
        let plate = app.buttons["Plate"].firstMatch
        XCTAssertTrue(plate.waitForExistence(timeout: 5), "no Plate in the head's menu")
        plate.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "card-plate").firstMatch.waitForExistence(timeout: 10),
                      "Plate did not open the plate's card")
        app.terminate()
    }
}
