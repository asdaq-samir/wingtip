import SwiftUI

/// The map's own buttons at its top right, as Maps has them and the web
/// app's MyPositionButton: the location arrow, filled while the map
/// follows own ship and an outline otherwise, and under it the sparkle
/// that opens Ask (AskView), a question about the flight put to the
/// assistant. With a route entered and the map panned off it, the
/// arrow's other face fits the course again; tapped then, the arrow
/// comes back to bring the map to the position. Last, EMER: the
/// airplane's emergency checklist in one tap (#220), on the ground as in
/// the air, as its siblings are always there and an engine fire during
/// start is one of the emergencies.
struct MapButtons: View {
    @Binding var following: Bool
    let routeAway: Bool
    let fitRoute: () -> Void
    /// Opens Ask; nil in the strip layout, where the field is the way in
    /// and no sparkle is drawn.
    let ask: (() -> Void)?
    /// Opens the airplane's emergency checklist (FlightUI.emergency).
    let emergency: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Button {
                if routeAway && !following { fitRoute() } else { following.toggle() }
            } label: {
                Image(systemName: routeAway && !following ? "point.topleft.down.to.point.bottomright.curvepath" : following ? "location.fill" : "location")
                    // The body style, so the glyph follows Dynamic Type; the
                    // 44-point round button itself does not grow.
                    .font(.body.weight(.medium))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(routeAway && !following ? "Show the whole route" : following ? "Stop following my position" : "My position")
            .background(.regularMaterial, in: Circle())
            .foregroundStyle(.primary)
            if let ask {
                Button(action: ask) {
                    Image(systemName: "sparkles")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Ask about this flight")
                .background(.regularMaterial, in: Circle())
                .foregroundStyle(Color.accentColor)
            }
            // Red, the system's colour for what is urgent, as an emergency
            // is; the word shrinks with a large text size before the round
            // button would grow.
            Button(action: emergency) {
                Text("EMER")
                    .font(.caption2.weight(.heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Emergency checklists")
            .background(.regularMaterial, in: Circle())
            .foregroundStyle(.red)
        }
        .padding(.trailing, 12)
        .padding(.top, 12)
    }
}

#Preview("MapButtons") {
    @Previewable @State var following = true
    MapButtons(following: $following, routeAway: false, fitRoute: {}, ask: {}, emergency: {})
}
