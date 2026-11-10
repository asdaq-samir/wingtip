import SwiftUI

/// What floats over the chart, in the system's own glass: Liquid Glass on
/// iOS 26 (glassEffect, the sheet's own presentation), the materials only
/// on iOS 18, which has no Liquid Glass. The UI audit of 2026-11-09 (item
/// 13) found the sheet painted over with .regularMaterial and a fixed
/// 24-point corner, and not one .glassEffect: the app looked like iOS 18
/// on iOS 26. design/tokens.json's material says the same: iOS uses its
/// system materials.
extension View {
    /// A floating control or card over the map: the system's glass in
    /// `shape` on iOS 26; on iOS 18, `material` behind it. Reduce
    /// Transparency, Increase Contrast and the rest are the system's to
    /// apply to both, as they are to its own (the owner, 2026-11-10:
    /// stock as is).
    @ViewBuilder
    func floatingGlass<S: Shape>(in shape: S, material: Material = .regularMaterial, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            background(material, in: shape)
        }
    }

    /// The planner's sheet over the map: on iOS 26 the system's Liquid
    /// Glass sheet and its own corners, untouched; on iOS 18 the regular
    /// material, so the map shows through as it does on iOS 26.
    @ViewBuilder
    func sheetGlass() -> some View {
        if #available(iOS 26.0, *) { self } else { presentationBackground(.regularMaterial) }
    }
}

/// Neighbouring glass that merges as Maps' own does: on iOS 26 the
/// pieces of glass inside share one GlassEffectContainer, so two buttons
/// side by side read as one surface and melt together as they move,
/// rather than as panes laid on top of each other. On iOS 18 the content
/// as it is.
extension View {
    /// The glass inside drawn as one, `spacing` apart at most to merge.
    func glassGroup(spacing: CGFloat = WingtipSpace.md) -> some View { modifier(GlassGroup(spacing: spacing)) }

    /// A button in the system's glass (iOS 26's .glass), in the look's
    /// tint; iOS 18's bordered button before it. Light, dark, Reduce
    /// Transparency and Increase Contrast are the system's to draw.
    func glassButton() -> some View { modifier(GlassButton(prominent: false)) }

    /// The one filled action of a row, in tinted glass (.glassProminent);
    /// iOS 18's bordered prominent button before it.
    func glassProminentButton() -> some View { modifier(GlassButton(prominent: true)) }
}

private struct GlassGroup: ViewModifier {
    let spacing: CGFloat

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}

private struct GlassButton: ViewModifier {
    let prominent: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if prominent { content.buttonStyle(.glassProminent) } else { content.buttonStyle(.glass) }
        } else if prominent {
            content.buttonStyle(.borderedProminent)
        } else {
            content.buttonStyle(.bordered)
        }
    }
}

extension View {
    /// A bar of actions at the foot of a scrolling page: on iOS 26 the
    /// system's bar (safeAreaBar), with no backdrop of its own, the words
    /// scrolled under it softened by the scroll-edge effect; on iOS 18 a
    /// material behind it.
    func glassFoot<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View { modifier(GlassFoot(bar: bar())) }
}

private struct GlassFoot<Bar: View>: ViewModifier {
    let bar: Bar

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.safeAreaBar(edge: .bottom, spacing: 0) { bar }
        } else {
            content.safeAreaInset(edge: .bottom, spacing: 0) { bar.background(.regularMaterial) }
        }
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
