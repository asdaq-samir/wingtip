import SwiftUI
import UIKit

/// The words on a filled button in the look's tint (.glassProminent), from
/// the look's own tokens: the palette's primaryForeground or its ground,
/// whichever stands further from the tint. White suits the deep blues by
/// day; the light tints at night -- Wingtip's #57A8FF, Glass Cockpit's
/// #46D3E6, Chart Ink's #5AC8FA -- take the dark ground, as white on
/// Glass Cockpit's cyan read 1.79:1 (the iOS sheet audit, 2026-11-10)
/// where WCAG 1.4.3 asks 4.5:1 of words (docs/design/ios.md, "Weights and
/// contrast"). Native is iOS's own and keeps the system's white.
extension Look {
    func labelOnTint(dark: Bool) -> UIColor? {
        guard !isStock else { return nil }
        let palette = palette(dark: dark)
        return [palette.primaryForeground, palette.background].max {
            NightPalette.contrast($0, palette.tint) < NightPalette.contrast($1, palette.tint)
        }
    }
}

extension View {
    /// The look's words on its tint (Look.labelOnTint), for a filled button.
    func labelOnTint() -> some View { modifier(LabelOnTint()) }
}

private struct LabelOnTint: ViewModifier {
    @Environment(\.look) private var look
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        if let label = look.labelOnTint(dark: scheme == .dark) {
            content.foregroundStyle(Color(uiColor: label))
        } else {
            content
        }
    }
}
