import SwiftUI

/// What floats over the chart, in the system's own Liquid Glass
/// (glassEffect, the sheet's own presentation). The UI audit of 2026-11-09
/// (item 13) found the sheet painted over with .regularMaterial and a
/// fixed 24-point corner, and not one .glassEffect. design/tokens.json's
/// material says the same: iOS uses its system materials.
extension View {
    /// A floating control or card over the map: the system's glass in
    /// `shape`. Reduce Transparency, Increase Contrast and the rest are
    /// the system's to apply, as they are to its own (the owner,
    /// 2026-11-10: stock as is).
    func floatingGlass<S: Shape>(in shape: S, interactive: Bool = false) -> some View {
        glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
    }
}

/// Neighbouring glass that merges as Maps' own does: the pieces of glass
/// inside share one GlassEffectContainer, so two buttons side by side
/// read as one surface and melt together as they move, rather than as
/// panes laid on top of each other.
extension View {
    /// The glass inside drawn as one, `spacing` apart at most to merge.
    func glassGroup(spacing: CGFloat = WingtipSpace.md) -> some View {
        GlassEffectContainer(spacing: spacing) { self }
    }

    /// A button in the system's glass (.glass), in the look's tint.
    /// Light, dark, Reduce Transparency and Increase Contrast are the
    /// system's to draw.
    func glassButton() -> some View { buttonStyle(.glass) }

    /// The one filled action of a row, in tinted glass (.glassProminent),
    /// its words in the look's own (labelOnTint), so they pass 4.5:1 on
    /// the light tints at night too.
    func glassProminentButton() -> some View { buttonStyle(.glassProminent).labelOnTint() }
}

extension View {
    /// A bar of actions at the foot of a scrolling page: the system's bar
    /// (safeAreaBar), with no backdrop of its own, the words scrolled
    /// under it softened by the scroll-edge effect.
    func glassFoot<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        safeAreaBar(edge: .bottom, spacing: 0, content: bar)
    }
}

/// A row of actions side by side (a card's Fly Here, Add Stop, Call),
/// their glass one surface (glassGroup).
struct GlassRow<Content: View>: View {
    var spacing: CGFloat = WingtipSpace.sm
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: spacing) { content }.glassGroup(spacing: spacing)
    }
}

/// The floating cards' one shape over the map (the UI audit's "one
/// floating-card shape per app"): design/tokens.json's card corner.
let floatingCard = RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous)
