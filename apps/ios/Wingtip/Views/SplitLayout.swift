import SwiftUI

/// How the root lays itself out: on an iPhone (a Max held sideways too,
/// though it is then of the regular width) and on an iPad in a narrow
/// Split View, the map under the system sheet with its detents, the
/// owner's Apple Maps model; on an iPad of the regular width, as Maps lays
/// out on the iPad, the map across the screen with the plan and the one
/// search in the sidebar at its left, a field's card, the profile and the
/// brief in the inspector at its right, and the figures along its foot.
enum RootLayout: Equatable {
    case sheet
    case split

    /// By the size classes alone, as Apple asks of apps on iPhone Duo
    /// (its "Prepare your app for iPhone Duo" talk): regular both ways is
    /// an iPad or iPhone Duo open, with room for the map beside the
    /// sidebar. An iPhone Max held sideways is regular across but compact
    /// up and down, and keeps the sheet, as do iPhone Duo closed and an
    /// iPad in a narrow Split View.
    static func of(_ horizontal: UserInterfaceSizeClass?, _ vertical: UserInterfaceSizeClass?) -> RootLayout {
        horizontal == .regular && vertical == .regular ? .split : .sheet
    }

    /// Which of the fields' pages open in the inspector on iPad: a field's
    /// card and the airspace over a point, as Maps opens a place beside
    /// the map. The lists stay in the sidebar, where they were opened.
    static func inspects(_ route: AirportRoute) -> Bool {
        switch route {
        case .airport, .airspace: true
        case .list, .nearFrom, .nearby: false
        }
    }
}

extension EnvironmentValues {
    /// Set in the iPad's layout: the plan's sheet holds no card of its
    /// own there, the inspector does (Navigator).
    @Entry var splitLayout = false
}

/// The iPad's layout: stock SwiftUI throughout. The plan under the one
/// search in the NavigationSplitView's sidebar (on iPadOS 26 and later a
/// floating card over the map, its rows on the sheet's solid ground), the
/// map as its detail across the screen, the second-level card in the
/// system inspector beside the split view, and the flight's figures on a
/// solid card along the foot of the map.
struct SplitLayout<Map: View>: View {
    @Environment(Navigator.self) private var nav
    let map: Map
    let search: OneSearchModel
    let openScreen: (Screen) -> Void
    let ask: (String?) -> Void
    @State private var columns: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columns) {
            PlanSheet(search: search, openScreen: openScreen, ask: ask)
                // The plan's rows on the look's own sheet ground, as the
                // iPhone's sheet is (PlanSheetPresentation), not the chart
                // through the sidebar's glass: main's nightly run
                // 44927130075 found the Search page's rows under 4.5:1 on
                // the iPad Pro (Find Nearby, Nearest's "Waiting for the
                // position"; WCAG 2.2 1.4.3).
                .background(WingtipInk.sheet)
                .navigationSplitViewColumnWidth(min: 320, ideal: 375, max: 420)
        } detail: {
            map
                .overlay(alignment: .bottom) {
                    // Figures on a solid ground, as rows and cards are
                    // (docs/design/ios.md §0): on glass over the chart the
                    // same run found the names DIST and TO under 4.5:1,
                    // semibold and in the tokens' black.
                    FiguresStrip()
                        .padding(.vertical, WingtipSpace.md)
                        .frame(maxWidth: 520)
                        .background(WingtipInk.sheet, in: floatingCard)
                        .padding(.bottom, WingtipSpace.lg)
                        .padding(.horizontal, WingtipSpace.lg)
                }
                .toolbar(.hidden, for: .navigationBar)
        }
        .navigationSplitViewStyle(.balanced)
        // On the split view, not on the map in its detail: an inspector in
        // a column puts its toolbar in that column's bar, and the map's is
        // hidden, so the card had no title, no close and no gear (main's
        // nightly run 44927130075: CardRuleTests, CardScrollTests and
        // CardSmokeTests on the iPad Pro). Here it is a column of its own,
        // full height, its card's bar its own.
        .inspector(isPresented: inspectorShown) {
            inspector
                // The cards' rows on a solid ground, not the map
                // through glass: glass is for controls (HIG
                // Materials; docs/design/ios.md §0), and the audit
                // found the Brief's words faint over the chart.
                .background(Color(.systemGroupedBackground))
                .inspectorColumnWidth(min: 320, ideal: 375, max: 440)
        }
        .environment(\.splitLayout, true)
        // A card's action done in the inspector (Fly Here, Fly This
        // Airplane): the card put away and the plan in the sidebar shown.
        .environment(\.showPlan, {
            search.close()
            nav.showPlan()
        })
    }

    private var inspectorShown: Binding<Bool> {
        Binding(get: { nav.card != nil }, set: { shown in if !shown { nav.close() } })
    }

    /// The card, the same one the iPhone's sheet draws (CardStack), a new
    /// one for each thing opened.
    @ViewBuilder private var inspector: some View {
        if let card = nav.card {
            CardStack(card: card, search: search).id(card)
        }
    }
}

#Preview("SplitLayout") {
    SplitLayout(map: Color(.secondarySystemBackground).ignoresSafeArea(), search: OneSearchModel(),
                openScreen: { _ in }, ask: { _ in })
        .environment(Session())
        .environment(Charts())
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
        .environment(Traffic())
        .environment(Verdict())
}
