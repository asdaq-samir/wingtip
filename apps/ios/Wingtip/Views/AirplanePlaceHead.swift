import SwiftUI

/// The airplane's profile's head, built as the airport card's is
/// (AirportPlaceHead, after Maps' place card, the owner's screenshot of
/// 2026-11-09): at full height the type's silhouette on a tile (no
/// airplane has a picture of its own yet), then the N-number large and
/// centred with its type under it, Fly This Airplane filled, and four
/// facts -- cruise, burn, usable fuel and glide -- each the engine's
/// figure for this airplane (airplane_figures), as the rows under it.
struct AirplanePlaceHead: View {
    let model: AirplaneProfileModel
    let fly: () -> Void
    @Environment(Plan.self) private var plan
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
                    .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                    .accessibilityHidden(true)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
            VStack(spacing: WingtipSpace.xs) {
                Text(model.tail).font(WingtipType.card.monospaced()).accessibilityAddTraits(.isHeader)
                Text(model.loaded ? model.typeLine ?? "Not in the FAA's registry" : "Looking it up in the FAA's registry")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            if plan.tail != model.tail {
                Button(action: fly) {
                    ActionFace(systemImage: WingtipIcon.airplane, title: "Fly This Airplane")
                }
                .glassProminentButton()
                .accessibilityIdentifier("fly-this-airplane")
            } else {
                Label("Flying This Airplane", systemImage: "checkmark")
                    .font(WingtipType.detail).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
            }
            HStack(alignment: .top, spacing: WingtipSpace.sm) {
                fact("Cruise", .cruiseTasKt)
                fact("Burn", .fuelBurnGph)
                fact("Usable", .usableFuelGal)
                fact("Glide", .glideRatio)
            }
        }
        .padding(.horizontal, WingtipSpace.lg)
        .padding(.vertical, WingtipSpace.md)
        .animation(.default, value: expanded)
    }

    /// A figure, label over value with its unit, as the rows below give it;
    /// "—" where the airplane has none, asked for in its row.
    private func fact(_ label: String, _ figure: OwnFigure) -> some View {
        let text = model.text(figure)
        let value = text.isEmpty ? "—" : "\(text) \(figure.unit)"
        return VStack(spacing: WingtipSpace.xxs) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.headline.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(figure.label): \(text.isEmpty ? "not set" : value)")
    }
}
