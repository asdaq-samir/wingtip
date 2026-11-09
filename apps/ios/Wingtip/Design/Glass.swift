import SwiftUI

/// What floats over the chart, in the system's own glass: Liquid Glass on
/// iOS 26 (glassEffect, the sheet's own presentation), the materials only
/// on iOS 18, which has no Liquid Glass. The UI audit of 2026-11-09 (item
/// 13) found the sheet painted over with .regularMaterial and a fixed
/// 24-point corner, and not one .glassEffect: the app looked like iOS 18
/// on iOS 26. design/tokens.json's material says the same: iOS uses its
/// system materials.
extension View {
    /// A floating control or card over the map: glass in `shape`; on iOS
    /// 18, `material` behind it. `interactive` for a button, whose glass
    /// answers the touch as the system's does. With Reduce Transparency on,
    /// the sheet's solid colour instead (FloatingGlass).
    func floatingGlass<S: Shape>(in shape: S, material: Material = .regularMaterial, interactive: Bool = false) -> some View {
        modifier(FloatingGlass(shape: shape, material: material, interactive: interactive))
    }

    /// The planner's sheet over the map: on iOS 26 the system's Liquid
    /// Glass sheet and its own corners, untouched; on iOS 18 the regular
    /// material, so the map shows through as it does on iOS 26. With
    /// Reduce Transparency on, solid.
    func sheetGlass() -> some View { modifier(SheetGlass()) }

    /// A bar or a backdrop of `material` that is not glass (the strip's
    /// foot, the figures pill), solid with Reduce Transparency on.
    func glassBackground(_ material: Material = .regularMaterial) -> some View {
        modifier(GlassBackground(material: material))
    }
}

/// Reduce Transparency asks for no see-through surfaces: a pilot who has
/// it on finds words over a busy chart hard to read through glass. The
/// system frosts its own glass and materials a little under it; these go
/// to the token's solid sheet colour, so every glass in the app follows
/// from here.
private struct FloatingGlass<S: Shape>: ViewModifier {
    let shape: S
    let material: Material
    let interactive: Bool
    @Environment(\.accessibilityReduceTransparency) private var solid

    func body(content: Content) -> some View {
        if solid {
            content.background(WingtipInk.sheet, in: shape)
        } else if #available(iOS 26.0, *) {
            content.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            content.background(material, in: shape)
        }
    }
}

private struct SheetGlass: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var solid

    func body(content: Content) -> some View {
        if solid {
            content.presentationBackground(WingtipInk.sheet)
        } else if #available(iOS 26.0, *) {
            content
        } else {
            content.presentationBackground(.regularMaterial)
        }
    }
}

private struct GlassBackground: ViewModifier {
    let material: Material
    @Environment(\.accessibilityReduceTransparency) private var solid

    func body(content: Content) -> some View {
        if solid { content.background(WingtipInk.sheet) } else { content.background(material) }
    }
}

extension View {
    /// A tab's content in the sheet, clear of the iOS 26 floating tab bar:
    /// the bar floats over the sheet's foot without giving the content a
    /// safe area there, and covered each tab's main action at the medium
    /// detent (the airport card's Fly Here, FPL's route list; the UI audit,
    /// 2026-11-09, item 2). The content scrolls under the glass and comes
    /// to rest above it. iOS 18's docked bar insets the content itself, and
    /// the iPad's sidebar (`floating` false) has its bar at the top.
    @ViewBuilder
    func clearOfTabBar(_ floating: Bool = true) -> some View {
        if #available(iOS 26.0, *), floating {
            safeAreaPadding(.bottom, WingtipSize.tabBar)
        } else {
            self
        }
    }
}

/// The floating cards' one shape over the map (the UI audit's "one
/// floating-card shape per app"): design/tokens.json's card corner.
let floatingCard = RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous)
