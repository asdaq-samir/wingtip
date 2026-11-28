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
    /// The sidebar's least width (its navigationSplitViewColumnWidth).
    static let leastSidebar: CGFloat = 320
    static let inspector: CGFloat = 375
    static let leastMap: CGFloat = 375

    /// What the sidebar's room is worked out from: the window's width,
    /// the split view's own beside the inspector, and whether a card is up.
    struct Need: Equatable {
        let width: CGFloat
        let split: CGFloat
        let cardUp: Bool

        /// A card up where the sidebar, the card and the map do not fit.
        var cardCrowds: Bool { cardUp && !SplitRoom.cardFitsBesideSidebar(width: width) }

        /// The inspector's column taking room with no card up, which
        /// iPadOS does at a window's first layout (SplitLayout.fit), where
        /// what is left cannot hold the sidebar beside the map.
        var emptyInspectorCrowds: Bool {
            !cardUp && split < width && split < SplitRoom.leastSidebar + SplitRoom.leastMap
        }
    }

    static func cardFitsBesideSidebar(width: CGFloat) -> Bool {
        width >= sidebar + inspector + leastMap
    }
}

/// The iPad's layout: stock SwiftUI throughout. The plan under the one
/// search in the NavigationSplitView's sidebar (on iPadOS 26 and later a
/// floating card over the map, its rows on the sheet's solid ground), the
/// map as its detail across the screen, the second-level card in the
/// system inspector beside the split view, the flight's figures on a
/// solid card along the foot of the map, and a chart the pilot stood
/// beside the map in a column of its own (BesidePane).
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
    /// The split view's own width, the window's less the inspector's.
    @State private var split: CGFloat = 0
    /// The sidebar put away by a card opened in a narrow window, to come
    /// back when the card goes (fit).
    @State private var hidForCard = false
    /// The split view built, once the window's columns have settled (fit).
    @State private var settled = false
    /// The detail's width, the map's and the chart's beside it together.
    @State private var detailWidth: CGFloat = 0
    @AppStorage(BesideShare.key) private var share = BesideShare.half

    var body: some View {
        // Nothing but the window's ground until the columns settle (fit).
        Group { if settled { columnsView } else { Color.clear } }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { split = $0 }
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
                    // Materials; docs/design/ios.md §0), and the Brief's words were faint over the chart.
                    .background(Color(.systemGroupedBackground))
                    .inspectorColumnWidth(min: 320, ideal: SplitRoom.inspector, max: 440)
            }
            // The window's width, measured round the inspector too: inside it,
            // the split view's own width lost the card's 375 points, so an
            // iPad Pro 13-inch held sideways (1,376) read 1,001 with a card up
            // and put the sidebar away though all three fit, and one upright
            // with a card up at launch (657) had the system lay the sidebar
            // over the map rather than beside it.
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            // The sidebar's room worked out from the widths and the card at
            // every change of any, the first layout included: a card already
            // up when the layout first measured (a link, a kept scene) left
            // the sidebar beside it with no room for the map.
            .onChange(of: need, initial: true) { _, need in fit(need) }
            // The documents reader over the window, which the iPhone hangs on
            // its card host (CardHost) and the iPad had nowhere: a library
            // row, a cite or a link's doc= opened nothing (DocumentsIPadTests:23).
            .modifier(ReaderCover(active: true))
            .environment(\.splitLayout, true)
            // A card's action done in the inspector (Fly Here, Fly This
            // Airplane): the card put away and the plan in the sidebar shown.
            .environment(\.showPlan, {
                search.close()
                nav.showPlan()
            })
    }

    /// The plan's sidebar and the map beside it.
    private var columnsView: some View {
        NavigationSplitView(columnVisibility: $columns) {
            PlanSheet(search: search, openScreen: openScreen, ask: ask)
                // The plan's rows on the look's own sheet ground, as the
                // iPhone's sheet is (PlanSheetPresentation), not the chart
                // through the sidebar's glass: main's nightly run
                // 44927130075 found the Search page's rows under 4.5:1 on
                // the iPad Pro (Find Nearby, Nearest's "Waiting for the
                // position"; WCAG 2.2 1.4.3).
                .background(WingtipInk.sheet)
                .navigationSplitViewColumnWidth(min: SplitRoom.leastSidebar, ideal: SplitRoom.sidebar, max: 420)
        } detail: {
            HStack(spacing: 0) {
                mapWithFigures
                // A chart standing beside the map (Beside the Map), its
                // share of the detail's room the pilot's (BesideShare).
                if let request = nav.beside {
                    Divider().ignoresSafeArea()
                    BesidePane(request: request)
                        .frame(width: besideWidth)
                        .transition(.move(edge: .trailing))
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { detailWidth = $0 }
            // The map's least room, an iPhone's width. Without it UIKit
            // took the detail to need more than the split view had at its
            // first layout, beside the inspector's column iPadOS shows then
            // (752 points of a 13-inch's 1,032; fit), laid the sidebar over
            // the map, and kept it so: the map under a dimmed scrim, whose
            // first tap, on the page toggle or any map button, only put the
            // sidebar away (UISplitViewController's displayMode
            // oneOverSecondary and splitBehavior overlay though tile was
            // asked, on 3 of 8 launches of SheetPageToggleTests).
            .navigationSplitViewColumnWidth(min: SplitRoom.leastMap, ideal: SplitRoom.leastMap * 2)
            .animation(MapMotion.animated ? .default : nil, value: nav.beside)
        }
        .navigationSplitViewStyle(.balanced)
    }

    /// The chart's width beside the map: its share of the detail's room.
    private var besideWidth: CGFloat { (detailWidth * share.fraction).rounded() }

    /// The map with the flight's figures along its foot.
    private var mapWithFigures: some View {
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
                    // After the chart in the accessibility order, as the
                    // map's buttons are (RootMap's MapButtonsDock).
                    .accessibilitySortPriority(-1)
            }
            // No bar over the map while the sidebar is up, its own bar
            // holding Hide Sidebar; with the sidebar put away, the
            // map's bar is up, clear over the chart, for the system's
            // Show Sidebar: hidden for good, it left a pilot who hid
            // the sidebar no way back to the plan and the search but
            // the menu bar.
            .toolbar(columns == .detailOnly ? .visible : .hidden, for: .navigationBar)
            .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
    }

    /// A card up in a window too narrow for the sidebar, the card and the
    /// map side by side (an iPad mini or an 11-inch held upright, Split
    /// View at a half or two thirds): the sidebar put away while it is up,
    /// so the map keeps a phone's width between them, and brought back
    /// once it goes; the pilot's own Show Sidebar still brings it at any
    /// time. Without it the 744-point iPad mini upright had 375 points of
    /// sidebar and 375 of card, and no map between.
    ///
    ///
    /// The split view is built only once the inspector's column, if it
    /// stands empty, leaves the sidebar and the map their room. iPadOS
    /// shows that column (280 points) at a window's first layout whatever
    /// its isPresented says, unless its own record of the last launch's
    /// columns hid it, and so on alternate launches. Built then, the split
    /// view had 554 points of an upright 11-inch's 834, too few for 320 of
    /// sidebar and 375 of map, and UIKit laid the sidebar over the map,
    /// with a dimmed scrim whose first tap only put it away, and kept it
    /// so once the column went: putting the sidebar away meanwhile did not
    /// help, as UIKit's first layout of it came after and showed it again
    /// (displayMode oneOverSecondary and splitBehavior overlay though tile
    /// was asked, in UIKit's LogUISplitViewController log, on every other
    /// launch of SheetPageToggleTests).
    private func fit(_ need: SplitRoom.Need) {
        // Not yet measured: nothing to work out from.
        guard need.width > 0, need.split > 0 else { return }
        if !settled, !need.emptyInspectorCrowds { settled = true }
        if need.cardCrowds {
            if columns != .detailOnly {
                columns = .detailOnly
                hidForCard = true
            }
        } else if hidForCard {
            columns = .all
            hidForCard = false
        }
    }

    private var need: SplitRoom.Need { SplitRoom.Need(width: width, split: split, cardUp: nav.card != nil) }

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
