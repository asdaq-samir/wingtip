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

/// Whether an iPad's window has the width for the sidebar, a card in the
/// inspector and the map side by side, by the columns' ideal widths
/// (SplitLayout's navigationSplitViewColumnWidth and inspectorColumnWidth)
/// and the least map worth the name, an iPhone's width. Wide enough on an
/// 11-inch, 13-inch and iPad mini held sideways at full screen (1,194,
/// 1,376 and 1,133 points); not upright (834, 1,032 and 744), nor in Split
/// View at a half or two thirds of a 13-inch (683 and 910).
enum SplitRoom {
    static let sidebar: CGFloat = 375
    static let inspector: CGFloat = 375
    static let leastMap: CGFloat = 375

    static func cardFitsBesideSidebar(width: CGFloat) -> Bool {
        width >= sidebar + inspector + leastMap
    }
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
    /// The window's width, for whether the sidebar, a card and the map fit
    /// side by side (SplitRoom).
    @State private var width: CGFloat = 0
    /// The sidebar put away by a card opened in a narrow window, to come
    /// back when the card goes (fit).
    @State private var hidForCard = false

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
                .navigationSplitViewColumnWidth(min: 320, ideal: SplitRoom.sidebar, max: 420)
        } detail: {
            map
                .overlay(alignment: .bottom) {
                    // Figures on a solid ground, as rows and cards are
                    // (docs/design/ios.md §0): on glass over the chart the
                    // same run found the names DIST and TO under 4.5:1,
                    // semibold and in the tokens' black.
                    FiguresStrip()
                        .environment(\.glanceFigures, true)
                        .padding(.vertical, WingtipSpace.md)
                        // Room for the figures a size up (glanceFigures).
                        .frame(maxWidth: 640)
                        .background(WingtipInk.sheet, in: floatingCard)
                        .padding(.bottom, WingtipSpace.lg)
                        .padding(.horizontal, WingtipSpace.lg)
                }
                // No bar over the map while the sidebar is up, its own bar
                // holding Hide Sidebar; with the sidebar put away, the
                // map's bar is up, clear over the chart, for the system's
                // Show Sidebar: hidden for good, it left a pilot who hid
                // the sidebar no way back to the plan and the search but
                // the menu bar (the iPad audit, 2026-11-21).
                .toolbar(columns == .detailOnly ? .visible : .hidden, for: .navigationBar)
                .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
        }
        .navigationSplitViewStyle(.balanced)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .onChange(of: nav.card != nil) { _, up in fit(cardUp: up) }
        .onChange(of: width) { _, _ in fit(cardUp: nav.card != nil) }
        // The one search asked for (⌘F, a link, the microphone) with the
        // sidebar put away: the sidebar, where the search is, comes back.
        .onChange(of: search.presented) { _, up in if up, columns == .detailOnly { columns = .all } }
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
                .inspectorColumnWidth(min: 320, ideal: SplitRoom.inspector, max: 440)
        }
        .environment(\.splitLayout, true)
        // A card's action done in the inspector (Fly Here, Fly This
        // Airplane): the card put away and the plan in the sidebar shown.
        .environment(\.showPlan, {
            search.close()
            nav.showPlan()
        })
    }

    /// A card up in a window too narrow for the sidebar, the card and the
    /// map side by side (an iPad mini or an 11-inch held upright, Split
    /// View at a half or two thirds): the sidebar put away while it is up,
    /// so the map keeps a phone's width between them, and brought back
    /// once it goes; the pilot's own Show Sidebar still brings it at any
    /// time. Without it the 744-point iPad mini upright had 375 points of
    /// sidebar and 375 of card, and no map between (the iPad audit,
    /// 2026-11-21).
    private func fit(cardUp: Bool) {
        if cardUp, !SplitRoom.cardFitsBesideSidebar(width: width) {
            if columns != .detailOnly {
                columns = .detailOnly
                hidForCard = true
            }
        } else if hidForCard {
            columns = .all
            hidForCard = false
        }
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
        .environment(Traffic(receiver: Receiver()))
        .environment(Verdict())
}
