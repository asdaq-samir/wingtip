import XCTest

/// What the card rule's tests share (CardRuleTests, CardScrollTests): the
/// launch, the text sizes, the cards and the ways in to each, read off the
/// screen by the handles the app gives them (SheetPage.testID, the map's
/// buttons' identifiers) and the system's own labels (Close, the sheet's
/// grabber). Offline: nothing here asks the planner, so the cards are the
/// ones that open with no route and no answer.
enum CardTests {
    /// The default text size and accessibility XXL (the owner's tests,
    /// 2026-11-10: "at the default and at the accessibility XXL text size").
    static let sizes: [(name: String, arguments: [String])] = [
        ("default", []),
        ("accessibility XXL", ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXL"]),
    ]

    static let searchPrompt = "Search airports, airplanes, or ask"

    /// A way into a card.
    enum Entry: CustomStringConvertible {
        /// A link's `open=` by its screen id (design/screens.json).
        case link(String)
        /// A card as a scene keeps it (`-card @KOSH`, `-card +map`).
        case card(String)
        /// A button on the map or beside the search, by its identifier or label.
        case button(String)
        /// A row of Settings, by its words.
        case settingsRow(String)

        var description: String {
            switch self {
            case .link(let id): "link \(id)"
            case .card(let kept): "card \(kept)"
            case .button(let id): "button \(id)"
            case .settingsRow(let words): "Settings' \(words) row"
            }
        }
    }

    /// One card, its handle, and every way in this offline run can take.
    struct Card {
        let name: String
        let id: String
        let entries: [Entry]
        /// Sits half way when opened (a thing), else full height (a page).
        var half = false
    }

    /// The table: a new card gets every check by one row here.
    static let cards: [Card] = [
        Card(name: "Map settings", id: "card-map", entries: [.button("map-settings"), .card("+map"), .settingsRow("Map")], half: true),
        Card(name: "Airport", id: "card-airport", entries: [.card("@KOSH")], half: true),
        Card(name: "Nearest", id: "card-nearest", entries: [.link("nearest")], half: true),
        Card(name: "Brief", id: "card-brief", entries: [.link("brief")]),
        Card(name: "Nav Log", id: "card-navlog", entries: [.link("navlog")]),
        Card(name: "Profile", id: "card-profile", entries: [.link("profile")]),
        Card(name: "Airplane", id: "card-airplane", entries: [.link("airplane")]),
        Card(name: "Settings", id: "card-setup", entries: [.link("setup"), .button("account-button")]),
        Card(name: "Downloads", id: "card-downloads", entries: [.link("downloads")]),
        Card(name: "Ask", id: "card-ask", entries: [.link("ask"), .button("Ask about this flight")]),
        // A plate's card, as a tap on its page on the map opens it; offline,
        // its title from its key and its settings all there.
        Card(name: "Plate", id: "card-plate", entries: [.card("+plate:KOSH:I36")], half: true),
    ]

    @MainActor
    static func launch(_ arguments: [String], size: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-layout", "plan"] + arguments + size + ["-fresh"]
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "the app did not come to the foreground")
        return app
    }

    /// The app opened at the plan, then the way in taken.
    @MainActor
    static func open(_ entry: Entry, size: [String]) -> XCUIApplication {
        switch entry {
        case .link(let id):
            return launch(["-screen", id], size: size)
        case .card(let kept):
            return launch(["-card", kept], size: size)
        case .button(let handle):
            let app = launch(["-screen", "fpl"], size: size)
            let button = app.buttons[handle]
            XCTAssertTrue(button.waitForExistence(timeout: 20), "no \(handle) button")
            button.tap()
            return app
        case .settingsRow(let words):
            let app = launch(["-screen", "setup"], size: size)
            XCTAssertTrue(card(app, "card-setup").waitForExistence(timeout: 20), "Settings did not open")
            let row = app.buttons[words].firstMatch
            scrollTo(row, in: app)
            row.tap()
            return app
        }
    }

    /// A card by its handle.
    @MainActor
    static func card(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    /// The card's close, the system's, at the right of its bar.
    @MainActor
    static func close(_ app: XCUIApplication) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label == 'Close'")).firstMatch
    }

    /// The sheet's grabber on top: the card's while one is up, its value
    /// "Expanded" at full height.
    @MainActor
    static func grabber(_ app: XCUIApplication) -> XCUIElement {
        let all = app.buttons.matching(identifier: "Sheet Grabber")
        return all.element(boundBy: max(0, all.count - 1))
    }

    /// Swiped up on the screen's middle until `element` is hittable, at
    /// most twelve times.
    @MainActor
    static func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<12 where !(element.exists && element.isHittable) {
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable, "\(element) could not be scrolled into view")
    }

    /// Until the element stops moving: the sheet's spring at rest.
    @MainActor
    static func settled(_ element: XCUIElement) {
        var last = element.frame
        for _ in 0..<20 {
            usleep(250_000)
            let now = element.frame
            if now == last { return }
            last = now
        }
    }
}
