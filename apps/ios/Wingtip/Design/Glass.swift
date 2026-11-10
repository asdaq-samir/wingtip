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
    /// The inset is the bar's own height above the home indicator
    /// (FloatingTabBar), not more: the soft scroll edge covers the whole
    /// inset, and with 64 points on top of the home indicator's 34 it
    /// began some 50 points above the bar and faded rows the bar does
    /// not cover (the accessibility audit's contrast check, 2026-11-09).
    @ViewBuilder
    func clearOfTabBar(_ floating: Bool = true) -> some View {
        if #available(iOS 26.0, *), floating {
            safeAreaPadding(.bottom, FloatingTabBar.height).glassScrollEdges()
        } else {
            self
        }
    }

    /// Words scrolled under the glass stay readable: on iOS 26 the soft
    /// scroll-edge effect at every edge of the scrollers inside, which
    /// fades the content as it passes under the bar, the tab bar or the
    /// sheet's head, as the system's own lists do. Nothing on iOS 18,
    /// whose bars are opaque once scrolled under.
    @ViewBuilder
    func glassScrollEdges() -> some View {
        if #available(iOS 27.0, *) {
            // iOS 27's HIG (Scroll views, June 2026): prefer the automatic
            // style, more opaque under a bar of many controls or a pinned
            // header, over the soft one, which needs its legibility proved.
            scrollEdgeEffectStyle(.automatic, for: .all)
        } else if #available(iOS 26.0, *) {
            scrollEdgeEffectStyle(.soft, for: .all)
        } else {
            self
        }
    }

    /// The tab bar folds to its tab up while a long list (the nav log, the
    /// Brief, the logbook) scrolls down, and comes back on the way up, as
    /// iOS 26's own apps do: more of the list in sight at the sheet's
    /// height. iOS 18's docked bar stays as it is.
    @ViewBuilder
    func tabBarMinimizesOnScroll() -> some View {
        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
    }
}

/// The system tab bar's height above the home indicator, as UIKit lays
/// out its own bar (49 points on an iPhone): the floating bar's top sits
/// that far above the safe area's foot (its frame in the accessibility
/// tree, 873 of 956 points on the iPhone 18 Pro Max, is these 49 and the
/// home indicator's 34). Asked of a UITabBar rather than written down, so
/// it follows the system.
@MainActor
enum FloatingTabBar {
    static let height: CGFloat = UITabBar().sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: 0)).height
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
    /// material behind it, solid with Reduce Transparency on.
    func glassFoot<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View { modifier(GlassFoot(bar: bar())) }
}

private struct GlassFoot<Bar: View>: ViewModifier {
    let bar: Bar

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.safeAreaBar(edge: .bottom, spacing: 0) { bar }
        } else {
            content.safeAreaInset(edge: .bottom, spacing: 0) { bar.glassBackground() }
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
