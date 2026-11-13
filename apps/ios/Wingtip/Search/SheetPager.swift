import SwiftUI

/// The plan's sheet's two pages (docs/design/rules.md §4): Search, the one
/// search and its home list, and FPL, the flight plan; turned by the one
/// round toggle on the map (MapSideButtons; the owner, 2026-11-13), where
/// the pager's dots and swipe were. FPL with no route shows the route box
/// empty.
enum PlanPage: Int, CaseIterable, Hashable {
    case search, fpl

    /// The page's name, as VoiceOver says it.
    var title: String {
        switch self {
        case .search: String(localized: "Search")
        case .fpl: Screen.fpl.title
        }
    }
}

/// The two pages, the one in sight on top and the other kept laid out
/// under it, hidden and out of reach, so each keeps its own scroll and
/// what was typed when the toggle turns back to it (the web's kept
/// SheetPages).
struct SheetPages<Search: View, Fpl: View>: View {
    let page: PlanPage
    @ViewBuilder let search: () -> Search
    @ViewBuilder let fpl: () -> Fpl

    var body: some View {
        ZStack {
            kept(search(), shown: page == .search)
            kept(fpl(), shown: page == .fpl)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sheet-pages")
    }

    private func kept(_ content: some View, shown: Bool) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .allowsHitTesting(shown)
            .accessibilityHidden(!shown)
    }
}
