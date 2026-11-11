import SwiftUI

/// The app's screens by name (design/screens.json) as the strip opens them:
/// each by the word the strip's field takes for it (FieldScreen), so a link
/// or a Shortcut lands where the pilot's own word would.
extension StripSheetView {
    static func field(for screen: Screen) -> FieldScreen? {
        switch screen {
        case .airplane, .checklists, .airplanes: .airplane
        case .logbook, .coach: .logbook
        case .setup, .minimums, .guide, .downloads, .about, .passengers: .setup
        case .brief: .brief
        case .navlog: .navlog
        case .profile: .profile
        case .flights: .saved
        case .favorites: .favorites
        case .nearest: .nearest
        case .emergency: .emergency
        case .fpl, .airport, .ask, .shared: nil
        }
    }

    /// Whether the strip has a page for the screen.
    static func opens(_ screen: Screen) -> Bool { field(for: screen) != nil }
}

extension View {
    /// The Brief Siri asked for (BriefAsk), and any screen asked for by its
    /// name (ScreenAsk), opened by the strip's own `open`.
    func takesAskedScreens(_ open: @escaping (FieldScreen) -> Void) -> some View {
        onChange(of: BriefAsk.shared.wanted, initial: true) { _, now in if now, BriefAsk.shared.take() { open(.brief) } }
            .onChange(of: ScreenAsk.shared.wanted, initial: true) { _, _ in
                if let screen = ScreenAsk.shared.take(Set(Screen.allCases.filter(StripSheetView.opens))),
                   let field = StripSheetView.field(for: screen) {
                    open(field)
                }
            }
    }
}
