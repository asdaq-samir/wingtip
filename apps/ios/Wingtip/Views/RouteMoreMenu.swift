import SwiftUI

/// FPL's •••, More, as the web's holds it (the owner, 2026-11-21): Route
/// Options, the ways to fly the route as the planner words them (the
/// system's menu picker, nested); Share Link; and Open in ForeFlight,
/// which sends the route on to the panel wirelessly (Garmin's Connext,
/// Avidyne, Dynon; the owner's pick of 2026-11-02). The rest of the
/// sharing, the checkpoints' pack and Print are the nav log's Share
/// (ShareMenu); Clear is the route card's ✕; the map's choices are Map
/// Settings'. Under them, what the web has no home for and the iPhone
/// keeps as a page's view options in its ••• (HIG, "Pull-down buttons"):
/// the saved flights and how the route is shown. Undo is the undo bar's
/// after each change (UndoBar), and shake's and ⌘Z's.
struct RouteMoreMenu: View {
    @Environment(Plan.self) private var plan
    @Environment(\.openURL) private var openURL
    let open: (Screen) -> Void

    var body: some View {
        Menu {
            Menu {
                RouteWayPicker()
            } label: {
                Label("Route Options", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
            }
            .disabled(plan.course == nil)
            ShareLink(item: RouteShare.link(plan)) { Label("Share Link", systemImage: "link") }
            Button { RouteShare.openInForeFlight(plan, openURL: openURL) } label: {
                Label("Open in ForeFlight", systemImage: WingtipIcon.send)
            }
            .disabled(plan.legs.isEmpty)
            Divider()
            Button { open(.flights) } label: { Label("Saved Flights", systemImage: "tray.full") }
            ShowRouteAs()
        } label: {
            Image(systemName: WingtipIcon.more).imageScale(.large).hitArea()
        }
        .accessibilityLabel("More")
        .accessibilityIdentifier("route-more")
    }
}

extension RouteShare {
    /// The route in ForeFlight: its checkpoints by their names in the pack
    /// where the pack was sent from this device (the nav log's Share),
    /// else where they are.
    static func openInForeFlight(_ plan: Plan, openURL: OpenURLAction) {
        let route = plan.idents.joined(separator: "-")
        let names = plan.checkpoints.map { $0.waypoint ?? "" }
        openURL(foreflightRoute(plan, named: packSent(route, names: names)))
    }

    /// The checkpoints' pack into ForeFlight, kept as sent so the route
    /// sent after names them.
    static func sendPack(_ plan: Plan, openURL: OpenURLAction) {
        let route = plan.idents.joined(separator: "-")
        markPackSent(route, names: plan.checkpoints.map { $0.waypoint ?? "" })
        openURL(openPack(packURL(plan)))
    }
}
