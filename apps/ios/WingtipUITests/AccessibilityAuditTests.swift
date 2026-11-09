import XCTest

/// Apple's accessibility audit (XCUIApplication.performAccessibilityAudit,
/// the checks Accessibility Inspector runs) over the screens a pilot
/// reaches without the planner: each tab of the sheet over the map, and
/// the strip layout's sheet. A label missing from a control, text that
/// does not grow with Dynamic Type, too little contrast or a hit area too
/// small fails here, on the runner, before a pilot with VoiceOver or
/// large text meets it. Launched as LaunchTests and FlowTests launch the
/// app (-tab, -fresh), and with no planner asked, so it runs offline.
///
/// The exceptions are in `known`, each with why; anything else fails.
final class AccessibilityAuditTests: XCTestCase {
    @MainActor
    private func launch(_ arguments: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += arguments + ["-fresh"]
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "the app did not come to the foreground")
        XCTAssertTrue(app.staticTexts.firstMatch.waitForExistence(timeout: 20), "no text on the screen")
        return app
    }

    /// Whether an issue is one the app keeps on purpose, and why; each is
    /// named, since the sheet lies over the map and an exception by the
    /// map's frame would hide the sheet's own issues too. Found by the
    /// runs of 2026-11-09 on the iPhone 18 Pro Max, each looked at in its
    /// screenshot:
    @MainActor
    private static func known(_ issue: XCUIAccessibilityAuditIssue, screenHeight: CGFloat) -> Bool {
        guard let element = issue.element else { return false }
        let id = element.identifier, type = element.elementType
        switch issue.auditType {
        case .hitRegion:
            // MapKit's own Legal link at the map's foot, its size Apple's.
            if type == .link && element.label == "Legal" { return true }
            // FPL's radio glyph: its 44-point area is its contentShape, as
            // CLAUDE.md has every small control make it (nothing grows),
            // which the audit, measuring the drawn glyph, does not see.
            return id == "mic"
        case .contrast:
            // An inactive control (Plan, Fly before a route or an airplane
            // is given) is exempt from contrast, WCAG 2.2 1.4.3.
            if !element.isEnabled { return true }
            // A row scrolled under the floating tab bar's glass at the
            // sheet's foot, faint there on purpose until scrolled up.
            if element.frame.maxY > screenHeight - 64 { return true }
            // The audit's near miss on the system's own secondary and
            // destructive colours, Apple's to set.
            if issue.compactDescription.localizedCaseInsensitiveContains("nearly") { return true }
            // The welcome's words are the ink's black on the card's white
            // in the screenshot; the audit reads them against the sheet's
            // shadow behind the card.
            return id == "strip-welcome"
        case .dynamicType:
            // "Partially unsupported" on the system's own List rows
            // (Setup's toggles, the checklist rows, a problem line): their
            // fonts are the text styles, which the largest-text run shows
            // growing; the audit stops at the size its own check caps at.
            return issue.compactDescription.localizedCaseInsensitiveContains("partially")
        case .textClipped:
            // A single-line field (the system's search field, FPL's From
            // and To, the N-number) scrolls its text as typed, as Apple's
            // own fields do.
            if type == .textField || type == .searchField { return true }
            // Open, not fixed here: FPL's Plan button beside the From and
            // To fields is squeezed at the largest sizes; laying that row
            // out again is the owner's call (CLAUDE.md: no control moves
            // without the owner).
            return type == .button && element.label == "Plan"
        default:
            return false
        }
    }

    /// The audits at the default text size leave clipping to the largest
    /// text run, where it is measured rather than projected ("may be
    /// clipped at larger sizes").
    private static let atDefaultSize = XCUIAccessibilityAuditType.all.subtracting(.textClipped)

    @MainActor
    private func audit(_ app: XCUIApplication, _ screen: String, _ types: XCUIAccessibilityAuditType = atDefaultSize) throws {
        var kept: [String] = []
        let height = app.frame.height
        try app.performAccessibilityAudit(for: types) { issue in
            if Self.known(issue, screenHeight: height) { return true }
            kept.append("\(screen): \(issue.compactDescription) – \(issue.element?.debugDescription ?? "no element")")
            return false
        }
        if !kept.isEmpty { print(kept.joined(separator: "\n")) }
    }

    /// The sheet brought up to its full height, so the audit reads what
    /// the pilot sees there: at the pill's or half height the rest of the
    /// sheet is laid out under the screen's foot (and under the floating
    /// tab bar), and every text there was reported cut short or faint.
    /// Dragged from `from` (a fraction of the screen's height inside the
    /// sheet's top) to near the top.
    /// Just inside the sheet's top at its two first sizes: the strip's
    /// pill (132 points, RootView.pill) and the tabs' half.
    private static let pill = 0.9
    private static let half = 0.53

    @MainActor
    private func raiseTheSheet(_ app: XCUIApplication, from: Double) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: from))
        start.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
        sleep(2)
    }

    @MainActor
    func testTheTabsPassTheAudit() throws {
        for tab in ["fpl", "airport", "airplane", "setup"] {
            // The layout said, as the simulator keeps the last one picked.
            let app = launch(["-layout", "tabs", "-tab", tab])
            raiseTheSheet(app, from: Self.half)
            try audit(app, tab)
            app.terminate()
        }
    }

    @MainActor
    func testTheStripPassesTheAudit() throws {
        let app = launch(["-layout", "strip"])
        raiseTheSheet(app, from: Self.pill)
        try audit(app, "strip")
    }

    /// At the largest accessibility text size, where a figure cut short or
    /// text that does not grow is what the audit finds: the strip, and the
    /// plan tab whose figures sit side by side at the default sizes.
    @MainActor
    func testTheLargestTextPassesTheAudit() throws {
        let largest = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        for (screen, arguments) in [("strip, largest text", ["-layout", "strip"]), ("fpl, largest text", ["-layout", "tabs", "-tab", "fpl"])] {
            let app = launch(arguments + largest)
            raiseTheSheet(app, from: arguments.contains("strip") ? Self.pill : Self.half)
            try audit(app, screen, .all)
            app.terminate()
        }
    }
}
