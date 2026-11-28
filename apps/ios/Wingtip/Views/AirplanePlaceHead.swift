import SwiftUI

/// The airplane card's head in the owner's P1 layout (2026-11-14, the
/// canvas XFZoWyJWzov7RCwRRPH253; the web's AirplaneProfileSheet), built as
/// the airport card's is (AirportPlaceHead): at full height the type's
/// silhouette on a tile, then the N-number large and centred with the
/// registry's make, model and year under it ("Piper PA-28-140, 1971"), and
/// its row of four (AirplaneActions, the web's design of 2026-11-26), its
/// Share in the card's head. Its photo is a picture tile under the facts
/// (AirplanePhotoTile, the owner's C1).
struct AirplanePlaceHead<Actions: View>: View {
    @Environment(\.lookAccent) private var accent
    let model: AirplaneProfileModel
    @ViewBuilder let actions: Actions
    @Environment(\.cardExpanded) private var expanded
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .title) private var tile = 84.0

    var body: some View {
        VStack(spacing: WingtipSpace.md) {
            if expanded {
                Image(systemName: WingtipIcon.airplane)
                    .font(.largeTitle)
                    .foregroundStyle(.tint)
                    .frame(width: tile, height: tile)
                    .background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                    .accessibilityHidden(true)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
            VStack(spacing: WingtipSpace.xs) {
                Text(model.tail).font(WingtipType.card.monospaced()).accessibilityAddTraits(.isHeader)
                Text(model.loaded ? model.typeLine ?? "Not in the FAA's registry" : "Looking it up in the FAA's registry")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            actions
        }
        .padding(.horizontal, WingtipSpace.lg)
        .padding(.vertical, WingtipSpace.md)
        .animation(.default, value: expanded)
    }
}
