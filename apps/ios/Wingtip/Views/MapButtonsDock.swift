import SwiftUI

/// How much of the screen's foot the sheets cover on the iPhone: the
/// plan's sheet and the card over it, each measured by its own content
/// (onGeometryChange) as the system sheet moves between its detents and
/// under a finger. Observed by the map's buttons alone (MapButtonsDock),
/// so a drag's new height each frame redraws them and not RootView, whose
/// body holds the whole map.
@MainActor @Observable
final class SheetEdge {
    /// The plan's sheet's height over the screen's foot, its bottom safe
    /// area counted, as RootView's sheetHeight is.
    var plan: CGFloat = 0
    /// The card's, while one is up over the plan (CardHost); nil with none.
    var card: CGFloat?

    /// The higher of the two tops: what the buttons sit over.
    var covered: CGFloat { max(plan, card ?? 0) }
}

/// The map's buttons where the layout puts them. Under the iPhone's sheet
/// they ride its top edge at the right, just above the search row, as the
/// owner asked (2026-11-11: "just above the search bar on the right",
/// "similar to how Apple Maps and Google Maps does it"; docs/design/rules.md
/// §7): 24 points over the sheet at the pill and half, following a finger's
/// drag, and fading out as the sheet goes on past half towards full, as
/// Maps' own buttons give way to its sheet at full height. SwiftUI has no
/// stock placement that follows a sheet over a UIKit map (`.mapControls`
/// places MapKit's buttons for SwiftUI's Map, at the top right, fixed), so
/// the system sheet's own height is read and the stack set over it. Beside
/// the iPad's sidebar there is no sheet: they stay at the top right.
///
/// At the left, level with them, the 3D and under it the page toggle
/// (MapSideButtons; the owner, 2026-11-13: "replace the radio button on
/// the left with the fpl toggle but below 3d"), riding the same top.
struct MapButtonsDock: View {
    @Environment(SheetEdge.self) private var sheetEdge
    let overSheet: Bool
    @Binding var following: Bool
    let routeAway: Bool
    let fitRoute: () -> Void
    let ask: (() -> Void)?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if overSheet {
            GeometryReader { screen in
                let full = screen.size.height
                let covered = sheetEdge.covered
                // Past 60% of the screen the sheet is on its way to full
                // (half is 45%, Detents.swift), and the buttons give way.
                let shown = covered < full * 0.6
                HStack(alignment: .bottom) {
                    MapSideButtons()
                    Spacer(minLength: 0)
                    buttons
                }
                .padding(.horizontal, WingtipSpace.md)
                .padding(.bottom, covered + WingtipSpace.xl)
                .frame(width: screen.size.width, height: full, alignment: .bottom)
                .opacity(shown ? 1 : 0)
                .allowsHitTesting(shown)
                // The system sheet settles with its own curve, which a
                // SwiftUI view under it does not share: the settle eased
                // over the sheet's own 0.3 s (motion.sheet), a finger's
                // drag followed as it comes.
                .animation(reduceMotion ? nil : WingtipMotion.sheetEase, value: covered)
                .animation(reduceMotion ? nil : .easeOut(duration: WingtipMotion.fade), value: shown)
            }
            .ignoresSafeArea()
        } else {
            VStack(spacing: WingtipSpace.sm) {
                buttons
                MapSideButtons()
            }
            .padding(.trailing, WingtipSpace.md)
            .padding(.top, WingtipSpace.md)
        }
    }

    private var buttons: some View {
        MapButtons(following: $following, routeAway: routeAway, fitRoute: fitRoute, ask: ask)
    }
}

/// The 3D and, under it, the sheet's page toggle: two round glass map
/// buttons, as Apple Maps' 2D/3D button, each showing where a tap goes.
///
/// - 3D stands the map up (MapKit's own 3D, RaisedMapView) where the
///   Map card's Terrain was (the owner, 2026-11-13): "3D" while flat, "2D"
///   while it stands, as Maps labels its own.
/// - The toggle turns the plan's sheet between Search and FPL (the owner,
///   2026-11-13: "Why not make the same tab on the right toggle between
///   search and fpl"), where its page dots were: the route's mark on
///   Search ("Show flight plan"), the magnifier on FPL ("Show search").
///   Only on the plan's sheet: the strip has one page.
struct MapSideButtons: View {
    @Environment(Navigator.self) private var nav
    @AppStorage(MapTerrain.key) private var terrain = MapTerrain.flat.rawValue
    @AppStorage("layout") private var layoutName = "plan"
    private let side = WingtipSize.mapButton

    var body: some View {
        VStack(spacing: WingtipSpace.sm) {
            let raised = terrain == MapTerrain.raised.rawValue
            Button {
                terrain = (raised ? MapTerrain.flat : MapTerrain.raised).rawValue
            } label: {
                Text(raised ? "2D" : "3D")
                    .font(.body.weight(.semibold))
                    .frame(width: side, height: side)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .floatingGlass(in: Circle(), interactive: true)
            .accessibilityLabel(raised ? "Show the map flat" : "Show the map in 3D")
            .accessibilityIdentifier("map-3d")
            if layoutName == "plan" {
                let toFpl = nav.sheetPage == .search
                Button {
                    withAnimation { nav.sheetPage = toFpl ? .fpl : .search }
                } label: {
                    Image(systemName: toFpl ? WingtipIcon.flightPlan : "magnifyingglass")
                        .font(.body.weight(.medium))
                        .frame(width: side, height: side)
                        .contentShape(Circle())
                        .symbolSwap()
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                .floatingGlass(in: Circle(), interactive: true)
                .accessibilityLabel(toFpl ? "Show flight plan" : "Show search")
                .accessibilityIdentifier("sheet-page-toggle")
                .popoverTip(FplTip.shared, arrowEdge: .bottom)
            }
        }
        .glassGroup(spacing: WingtipSpace.md)
    }
}
