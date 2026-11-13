import SwiftUI

/// Any screen opened by its name (design/screens.json): a link's `open=`,
/// a Shortcut, a figure or a row tapped. The one way a page opens by name
/// on the iPhone and the iPad (the owner's card rule, 2026-11-10): the
/// plan is the sheet's root, the search is its field, the emergency
/// assistant is full screen, and every other screen is a card over the
/// plan (Navigator; the iPad's sidebar or inspector). The switch is over
/// the generated list, so a screen added there fails the build here
/// until it opens.
extension RootView {
    func openScreen(_ screen: Screen) {
        let strip = layout == .sheet && layoutName == "strip"
        if strip, StripSheetView.opens(screen) {
            screens.screenAsk.ask(screen)
            if detent != .large { detent = .large }
            return
        }
        switch screen {
        case .fpl:
            // The plan, the sheet's FPL page (Navigator.showPlan).
            showPlan()
            if detent == RootView.pill { detent = .half }
        case .airport:
            // What the Airport tab was: the search, up with its Favorites,
            // Recents and Nearest.
            // TODO(claude/carousel-web): design/screens.json's "search"
            // screen, once its generated Screen case is merged, opens the
            // Search page here too.
            nav.showPlan()
            nav.sheetPage = .search
            search.presented = true
        case .favorites:
            shelf.show(.favorites)
            show(screen)
        case .ask: ask(nil)
        case .emergency: emergency.open = .link
        case .airplane, .setup, .brief, .profile, .flights, .navlog, .nearest, .passengers, .checklists, .airplanes,
             .logbook, .coach, .minimums, .guide, .downloads, .about:
            show(screen)
        // A shared flight's preview opens from its link's keys
        // (AppCommand.sharedFlight); the name alone names no flight.
        case .shared: break
        }
    }

    /// The screen's card over the plan, the search put away.
    private func show(_ screen: Screen) {
        search.close()
        nav.open(.screen(screen))
    }

    /// The plan in sight, half way up: where a route Siri or a link set
    /// is shown.
    func showPlan() {
        search.close()
        nav.showPlan()
        if layout == .sheet, detent != .half { detent = .half }
    }
}

/// The sheet rising for the one search (RootView): all the way while the
/// search is up, clear of the keyboard; from the pill to half when the
/// welcome is put away and the search asks for the destination, so it is
/// seen (rule 11).
struct SheetFollowsSearch: ViewModifier {
    let search: OneSearchModel
    let layout: RootLayout
    @Binding var detent: PresentationDetent

    func body(content: Content) -> some View {
        content
            .onChange(of: search.presented) { _, up in if up, layout == .sheet, detent != .large { detent = .large } }
            .onChange(of: search.askingDestination) { _, asking in if asking, detent == RootView.pill { detent = .half } }
    }
}
