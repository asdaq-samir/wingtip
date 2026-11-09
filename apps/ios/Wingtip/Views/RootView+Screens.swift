import SwiftUI

/// Any screen opened by its name (design/screens.json): a link's `open=`,
/// a Shortcut, a figure or a row tapped. The one place the iPhone says
/// where each screen lives; the switch is over the generated list, so a
/// screen added there fails the build here until it opens.
extension RootView {
    func openScreen(_ screen: Screen) {
        let strip = layout == .sheet && layoutName == "strip"
        if strip, StripSheetView.opens(screen) {
            ScreenAsk.shared.ask(screen)
            if detent != .large { detent = .large }
            return
        }
        switch screen {
        case .fpl: show(.fpl)
        case .airport: show(.airport)
        case .airplane, .checklists: show(.airplane)
        case .setup: show(.setup)
        case .brief, .profile, .flights:
            // The iPad's inspector holds these, as FPL's own buttons open them.
            if layout == .split {
                sideCard = screen == .brief ? .brief : screen == .profile ? .profile : .flights
                tab = .fpl
                return
            }
            show(.fpl, asking: screen)
        case .navlog, .passengers: show(.fpl, asking: screen)
        case .favorites:
            AirportShelf.shared.show(.favorites)
            show(.airport)
        case .nearest:
            AirportShelf.shared.show(.nearest)
            show(.airport)
        case .ask: asking = true
        case .emergency: Emergency.shared.open = .link
        case .airplanes: show(.airplane, asking: screen)
        case .logbook, .coach, .minimums, .guide, .downloads, .about: show(.setup, asking: screen)
        // A shared flight's preview opens from its link's keys
        // (PendingCommand.sharedFlight); the name alone names no flight.
        case .shared: break
        }
    }

    /// The tab, half way up, and the page on it asked of its own stack.
    private func show(_ to: Tabs, asking page: Screen? = nil) {
        tab = to
        if let page { ScreenAsk.shared.ask(page) }
        let height: PresentationDetent = page == nil ? .medium : .large
        if detent != height { detent = height }
    }
}
