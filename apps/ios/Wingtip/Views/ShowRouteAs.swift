import SwiftUI

/// How FPL shows the route, picked in the route's ••• menu (the owner,
/// 2026-11-13: "I want to move fpl layout to the fpl page"; the web's
/// ShowRouteAs), as iOS keeps a page's view options in its ••• menu: the
/// route box under the one search, or the strip, the flight as one strip
/// (StripSheetView; the owner's pick of 2026-11-04). The same key the
/// Screen row of Settings kept it under.
struct ShowRouteAs: View {
    @AppStorage("layout") private var layoutName = "plan"

    var body: some View {
        Picker(selection: $layoutName) {
            Label("Route Box", systemImage: "list.bullet.rectangle").tag("plan")
            Label("Strip", systemImage: "rectangle.split.1x2").tag("strip")
        } label: {
            Text("Show Route As")
        }
        .pickerStyle(.inline)
        .accessibilityIdentifier("route-edit-select")
    }
}
