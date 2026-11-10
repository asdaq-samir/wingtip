import SwiftUI

/// Any screen opened by its name (design/screens.json): a link's `open=`,
/// a Shortcut, a figure or a row tapped. The one place the iPhone says
/// where each screen lives now the tabs are gone (the owner's one-search
/// design, 2026-11-09): the plan is the sheet's root, the search is its
/// field, Setup is the account button's Settings page, and every other
/// screen a page on the sheet's stack. The switch is over the generated
/// list, so a screen added there fails the build here until it opens.
extension RootView {
    func openScreen(_ screen: Screen) {
        let strip = layout == .sheet && layoutName == "strip"
        if strip, StripSheetView.opens(screen) {
            ScreenAsk.shared.ask(screen)
            if detent != .large { detent = .large }
            return
        }
        switch screen {
        case .fpl:
            // The plan, the sheet's root.
            search.close()
            path = []
            if detent == RootView.pill { detent = .medium }
        case .airport:
            // What the Airport tab was: the search, up with its Favorites,
            // Recents and Nearest.
            path = []
            search.presented = true
        case .brief, .profile, .flights:
            // The iPad's inspector holds these, as the plan's own buttons
            // open them.
            if layout == .split, let card = SideCard(screen) {
                sideCard = card
                return
            }
            show(screen)
        case .favorites:
            AirportShelf.shared.show(.favorites)
            show(screen)
        case .nearest:
            AirportShelf.shared.show(.nearest)
            show(screen)
        case .ask: ask(nil)
        case .emergency: Emergency.shared.open = .link
        case .airplane, .setup, .navlog, .passengers, .checklists, .airplanes,
             .logbook, .coach, .minimums, .guide, .downloads, .about:
            show(screen)
        // A shared flight's preview opens from its link's keys
        // (PendingCommand.sharedFlight); the name alone names no flight.
        case .shared: break
        }
    }

    /// The screen's page on the plan, the sheet up to show it.
    private func show(_ screen: Screen) {
        search.close()
        path = [.screen(screen)]
        if layout == .sheet, detent != .large { detent = .large }
    }

    /// The plan in sight, half way up: where a route Siri or a link set
    /// is shown.
    func showPlan() {
        search.close()
        path = []
        if layout == .sheet, detent != .medium { detent = .medium }
    }
}
