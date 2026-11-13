import CoreLocation
import SwiftUI
import UIKit

/// The map under a sheet with three sizes -- the pill, half and full, as
/// Apple Maps has them and as the web app imitates them -- holding the
/// plan under the one search (PlanSheet; the owner's one-search design,
/// 2026-11-09, in the tabs' place). The system's own sheet, so the drag,
/// the detents and the glass are iOS's, not a copy.
struct RootView: View {
    @Environment(Replay.self) var replay
    @Environment(Emergency.self) var emergency
    @Environment(AirportShelf.self) var shelf
    @Environment(Navigator.self) var nav
    @Environment(Charts.self) var charts
    @Environment(Session.self) var session
    /// The flight (FlightSession): the plan, own ship and the airplane
    /// tracked that the commands act on (RootView+Commands).
    @Environment(FlightSession.self) var flight
    @Environment(ScreenModels.self) var screens
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @State var detent: PresentationDetent = .half
    @State private var sheetUp = true
    /// The card and the pages in it (Navigator): the pages a scene was on
    /// come back with it (SceneStorage), as Apple restores state, so a
    /// restored scene lands where the pilot left it. A launch argument's
    /// screen (`-screen airport`, for CI's pictures and the UI tests) wins.
    @SceneStorage("pages") private var scenePages: String?
    /// The one search, the sheet's (OneSearchModel): kept here, so a link,
    /// Siri and the map can bring it up.
    @State var search = OneSearchModel()
    /// The screen's layout, as the web app's Screen row has it: the plan
    /// under the one search, or the strip (StripSheetView: the flight as
    /// one strip under the same search; the owner's pick of 2026-11-04).
    /// The same key as the web's preference; a `-layout strip` launch
    /// argument sets it for CI's pictures.
    @AppStorage("layout") var layoutName = "plan"
    /// Whether the map has shown (ChartMap's reveal): the loading mark is
    /// over it until then.
    @State private var mapShown = false
    /// The height the sheet covers at the foot of the screen, until the
    /// map shows: only the map's opening point and the loading mark over
    /// it read it (ChartMap.Coordinator.open, MapLoading), and neither
    /// does once the map is in. Not written after that, so a drag of the
    /// sheet, a new height each frame, does not run this body and the
    /// whole map's update again each frame.
    @State private var sheetHeight: CGFloat = 0

    /// The sheet's lowest size, the pill: the page's first row (the
    /// search's on Search, the route's on FPL), as Maps' pill is its search
    /// row; 132 points for the row, no page dots over it since 2026-11-13.
    static let pill = PresentationDetent.height(132)

    var layout: RootLayout { .of(sizeClass, verticalSizeClass) }

    var body: some View {
        Group {
            switch layout {
            case .sheet:
                map
                    .sheet(isPresented: $sheetUp) {
                        Group {
                            if layoutName == "strip" {
                                StripSheetView(detent: $detent, opened: Bindable(nav).planPath, search: search)
                            } else {
                                PlanSheet(search: search, openScreen: { openScreen($0) }, ask: { ask($0) })
                            }
                        }
                        // How much of the map the sheet covers, for the map's
                        // opening point and the loading mark over it, until
                        // the map shows (sheetHeight).
                        .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.bottom } action: { height in
                            if !mapShown { sheetHeight = height }
                            // The map's buttons ride its top (MapButtonsDock),
                            // read there alone, so this body is not run again.
                            screens.sheetEdge.plan = height
                        }
                        .environment(\.sheetAtPill, detent == RootView.pill)
                        .presentationDetents([RootView.pill, .half, .large], selection: $detent)
                        .presentationBackgroundInteraction(.enabled(upThrough: .half))
                        .interactiveDismissDisabled()
                        // The system sheet settles at its detents with its own
                        // feel; no tap of ours is added to a stock part (the
                        // owner, 2026-11-10).
                    }
            case .split:
                SplitLayout(map: map, search: search, openScreen: { openScreen($0) }, ask: { ask($0) })
                    // No sheet over the iPad's layout: its alerts and the
                    // emergency assistant from the root itself.
                    .modifier(TopHosts(active: true))
            }
        }
        // Ready to Fly given the app's models, for a start from anywhere.
        .modifier(ReadyToFlyHost())
        // A shared flight, the flight just logged and the clearance, each
        // a card when its model asks (CardTriggers).
        .modifier(CardTriggers())
        .onChange(of: layout, initial: true) { _, now in nav.split = now == .split }
        // The scene's pages kept and brought back (SceneStorage); a launch
        // argument's screen (CI's pictures, the UI tests) wins over them.
        .onAppear {
            nav.split = layout == .split
            let arguments = CommandLine.arguments
            if let at = arguments.firstIndex(of: "-layout"), at + 1 < arguments.count { layoutName = arguments[at + 1] }
            if let at = arguments.firstIndex(of: "-screen"), at + 1 < arguments.count, let screen = Screen(rawValue: arguments[at + 1]) {
                openScreen(screen)
            } else if let at = arguments.firstIndex(of: "-card"), at + 1 < arguments.count, let page = SheetPage(stored: arguments[at + 1]) {
                // A card as a scene keeps it (`-card @KOSH`, `-card +map`),
                // for the card rule's UI tests (CardRuleTests).
                nav.open(page)
            } else if !arguments.contains("-fresh") {
                // A fresh launch (the UI tests', CI's pictures') starts
                // clean: the card the last launch kept came back over a
                // screen the build does not know (`-screen search`), so
                // one test's KOSH card sat under the next test's sheet.
                nav.restore(SheetPage.restore(scenePages))
            }
        }
        .onChange(of: nav.stored) { _, now in scenePages = SheetPage.store(now) }
        // The sheet rises with the search (SheetFollowsSearch).
        .modifier(SheetFollowsSearch(search: search, layout: layout, detent: $detent))
        // The picked look's tint, the brand's blue by default (Look).
        .lookTint()
        // The key actions' taps, none with Reduce Motion on (Feel).
        .modifier(FeelHost())
        // ⌘F, ⌘B and ⌘L with a hardware keyboard (KeyboardShortcuts).
        .modifier(KeyboardShortcuts(search: { search.presented = true }, open: { openScreen($0) }))
        // A link's, Siri's or a Shortcut's ask (the owner's, 2026-11-03:
        // Siri and Shortcuts through App Intents), and a card's own.
        .modifier(CommandHost { await apply($0, then: $1) })
        // A field's mark held: its card's preview and the plan's three.
        .onAppear { AirportMarkMenu.shared.input = markPreview }
        .environment(\.appCommand, AppCommandAction { command, then in Task { await apply(command, then: then) } })
    }

    /// A field or a point opened from the map: its card over the plan,
    /// half way up, on the iPhone (a field tapped after another takes its
    /// place rather than piling up); in the inspector on the iPad.
    func open(_ route: String) {
        search.close()
        if layout == .sheet, layoutName == "strip" {
            // The strip pushes its cards on its own stack (StripSheetView).
            nav.planPath.append(.airport(route))
        } else {
            nav.open(.airport(route))
        }
    }

    /// Ask, with the question the search sent where there is one: its
    /// card, as every thing's is.
    func ask(_ question: String?) {
        search.close()
        nav.open(.ask(question))
    }

    /// The height of the map the sheet covers: none beside the sidebar.
    private var mapInset: CGFloat {
        layout == .sheet && sheetUp ? sheetHeight : 0
    }

    /// The map with its buttons and banners, under the sheet or beside
    /// the sidebar: a view of its own (RootMap), so what it reads at every
    /// fix (own ship, the dry run, the traffic) runs its body alone, not
    /// this one with the sheet.
    private var map: some View {
        RootMap(layout: layout, inset: mapInset, mapShown: $mapShown, search: search,
                open: { open($0) }, ask: { ask($0) })
    }
}

#Preview("RootView") {
    RootView()
        .modifier(AppModels(session: Session(), charts: Charts(), nav: Navigator(), screens: ScreenModels()))
}
