import XCTest

/// The flows a pilot takes first, driven through the app as Apple's UI
/// testing drives one, on the runner beside LaunchTests: a route planned
/// on the plan and its nav log shown, a field's card opened from the one
/// search and the plan flown there with Fly Here, and the Brief opened. Each asks the planner the build is
/// pointed at (WINGTIP_HOST, native-ios.yml), so the waits are long and
/// the asserts ask only that the screen came, not what it said -- the
/// planner's own tests hold its figures. Launched with -fresh, so a
/// route the simulator kept from the last run does not fill the fields.
///
/// The handles are the accessibility identifiers in the files this
/// pass could add them to (an airport result, the card's head, the
/// Brief, Fly Here) and the labels the a11y pass gave the rest: the plan's
/// From and To fields and its Plan button are matched by their words, and
/// the Brief glyph by its label "Brief" (or "Brief, VFR flight not
/// recommended").
final class FlowTests: XCTestCase {
    /// How long a planner answer may take on the runner, s.
    private static let planner: TimeInterval = 120

    /// Every flow here needs the planner (PlannerHost).
    override func setUp() async throws {
        try await super.setUp()
        try await PlannerHost.skipWithoutAddress()
    }

    @MainActor
    private func launch(screen: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-layout", "plan", "-screen", screen, "-fresh"]
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "the app did not come to the foreground")
        return app
    }

    /// A route typed into the plan and planned: C81 to KDLH, the planner's
    /// own test route.
    @MainActor
    private func plan(_ app: XCUIApplication) {
        let from = app.textFields["From"]
        XCTAssertTrue(from.waitForExistence(timeout: 30), "no From field")
        from.tap()
        from.typeText("C81")
        let to = app.textFields["To"]
        XCTAssertTrue(to.waitForExistence(timeout: 10), "no To field")
        to.tap()
        to.typeText("KDLH")
        let plan = app.buttons["Plan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 10), "no Plan button")
        plan.tap()
    }

    @MainActor
    private func keep(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    @MainActor
    func testARouteIsPlannedAndItsNavLogShown() throws {
        let app = launch(screen: "fpl")
        plan(app)
        // The nav log, the route card's Nav Log button (the one-row
        // header, 2026-11-10), enabled once the planner has streamed the
        // legs: its page's header, "Nav Log · FL-045".
        let item = app.buttons["Nav Log"]
        XCTAssertTrue(item.waitForExistence(timeout: Self.planner), "no Nav Log on the route card")
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: item)
        XCTAssertEqual(XCTWaiter().wait(for: [ready], timeout: Self.planner), .completed, "the nav log never came")
        item.tap()
        let navLog = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Nav Log'")).firstMatch
        XCTAssertTrue(navLog.waitForExistence(timeout: Self.planner), "the nav log did not appear")
        keep(app, "nav log")
    }

    @MainActor
    func testAnAirportsCardOpensFromTheSearch() throws {
        // The one search, up (what the Airport tab was), in the sheet or
        // the iPad's sidebar.
        let app = launch(screen: "airport")
        let search = app.searchFields["Search airports and airplanes"]
        XCTAssertTrue(search.waitForExistence(timeout: 30), "no search field")
        search.tap()
        search.typeText("KDLH")
        let result = app.descendants(matching: .any)["airport-result-KDLH"]
        XCTAssertTrue(result.waitForExistence(timeout: Self.planner), "KDLH was not found")
        result.tap()
        let head = app.descendants(matching: .any)["airport-card-head"]
        XCTAssertTrue(head.waitForExistence(timeout: Self.planner), "the card did not open")
        keep(app, "airport card")
        // Fly Here, the card's primary action: the plan shown with KDLH
        // as its destination.
        let flyHere = app.descendants(matching: .any)["fly-here"]
        XCTAssertTrue(flyHere.waitForExistence(timeout: 10), "no Fly Here")
        flyHere.tap()
        let to = app.textFields["To"]
        XCTAssertTrue(to.waitForExistence(timeout: 30), "the plan did not show")
        XCTAssertEqual(to.value as? String, "KDLH")
    }

    @MainActor
    func testTheBriefOpens() throws {
        let app = launch(screen: "fpl")
        plan(app)
        // The Brief glyph beside the altitude, there as soon as both ends
        // are typed; its label says when VFR is not recommended.
        let brief = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Brief'")).firstMatch
        XCTAssertTrue(brief.waitForExistence(timeout: Self.planner), "no Brief button")
        brief.tap()
        XCTAssertTrue(app.navigationBars["Brief"].waitForExistence(timeout: Self.planner), "the Brief did not open")
        keep(app, "brief")
    }
}

/// The planner the build was made for (WINGTIP_HOST, passed in by the
/// scheme), for the UI tests that need it: FlowTests and PlateMapTests.
enum PlannerHost {
    /// With that host having no address, a test that needs the planner is
    /// skipped and says why, where it would otherwise wait minutes and
    /// fail: until the site is deployed, wingtipmaps.app has no address
    /// and every run on main went red on these alone. Only that failure
    /// skips; a timeout, a TLS error or a planner that is down once the
    /// site exists falls through, so the tests fail as they should.
    /// LaunchTests still runs, so a build that cannot show its first
    /// screen fails as before.
    static func skipWithoutAddress() async throws {
        let given = ProcessInfo.processInfo.environment["WINGTIP_HOST"]
        let host = given.flatMap { $0.isEmpty ? nil : $0 } ?? "wingtipmaps.app"
        guard let url = URL(string: "https://\(host)/") else {
            throw XCTSkip("no planner host to ask")
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "HEAD"
        do {
            _ = try await URLSession.shared.data(for: request)
        } catch let error as URLError where error.code == .cannotFindHost || error.code == .dnsLookupFailed {
            throw XCTSkip("\(host) has no address yet (\(error.localizedDescription)), so the tests that need the planner are skipped")
        } catch {
            // Any other answer, or none, is the test's to judge.
        }
    }
}
