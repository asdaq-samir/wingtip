import SwiftUI

/// The map's own buttons, riding the sheet's top at the right on the
/// iPhone and at the top right beside the iPad's sidebar (MapButtonsDock),
/// as the web app's MyPositionButton: the location arrow, filled while the map
/// follows own ship and an outline otherwise, and under it the sparkle
/// that opens Ask (AskView), a question about the flight put to the
/// assistant. With a route entered and the map panned off it, the
/// arrow's other face fits the course again; tapped then, the arrow
/// comes back to bring the map to the position.
struct MapButtons: View {
    @Environment(Navigator.self) private var nav
    @Environment(\.lookAccent) private var accent
    @Environment(OwnShip.self) private var ownShip
    @Binding var following: Bool
    let routeAway: Bool
    let fitRoute: () -> Void
    /// Opens Ask; nil in the strip layout, where the field is the way in
    /// and no sparkle is drawn.
    let ask: (() -> Void)?

    /// Each button's side, Maps' own 48 points (design/tokens.json's
    /// size.map-button, past the 44-point least).
    private let side = WingtipSize.mapButton

    var body: some View {
        // One capsule of glass holding the three, a hairline between each,
        // as Maps groups its map buttons (the owner's decision, 2026-11-10;
        // docs/design/ios.md §0), where they were three separate circles.
        VStack(spacing: 0) {
            // The Map card, as Maps' map button opens Choose Map: the
            // layers, the weather and the alerts (MapSettingsView).
            Button { nav.open(.mapSettings) } label: { glyph("map") }
                .accessibilityLabel("Map Settings")
                .accessibilityIdentifier("map-settings")
                .foregroundStyle(accent)
            Divider().frame(width: side * 0.6)
            Button {
                // The position asked for here, the first time it is wanted.
                ownShip.askLocation()
                if routeAway && !following { fitRoute() } else { following.toggle() }
            } label: {
                glyph(routeAway && !following ? WingtipIcon.flightPlan : following ? WingtipIcon.myLocationOn : WingtipIcon.myLocation)
                    .symbolSwap()
            }
            .accessibilityLabel(routeAway && !following ? "Show the whole route" : following ? "Stop following my position" : "My position")
            .foregroundStyle(.primary)
            if let ask {
                Divider().frame(width: side * 0.6)
                Button(action: ask) { glyph(WingtipIcon.brief) }
                    .accessibilityLabel("Ask about this flight")
                    .foregroundStyle(accent)
            }
        }
        .buttonStyle(.plain)
        // Liquid Glass on iOS 26, as Maps' own buttons are; the material
        // on iOS 18 (Design/Glass.swift).
        .floatingGlass(in: Capsule(), interactive: true)
        .glassGroup(spacing: WingtipSpace.md)
    }

    /// A button's glyph in the body style, so it follows Dynamic Type,
    /// centred in its square of the capsule, which does not grow; a
    /// pointer lifts it, as Maps' buttons on the iPad.
    private func glyph(_ name: String) -> some View {
        Image(systemName: name)
            .font(.body.weight(.medium))
            .frame(width: side, height: side)
            .contentShape(Rectangle())
            .hoverEffect(.highlight)
    }
}

#Preview("MapButtons") {
    @Previewable @State var following = true
    MapButtons(following: $following, routeAway: false, fitRoute: {}, ask: {})
        .environment(OwnShip())
}
