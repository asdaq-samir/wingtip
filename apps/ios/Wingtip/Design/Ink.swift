import SwiftUI
import UIKit

/// The tokens' states as SwiftUI colours that follow the appearance: the
/// light palette by day, the dark at night (design/tokens.json color.theme,
/// generated into WingtipPalette). A screen asks for the role, never a
/// system colour, so the web and the phones say a problem or a caution in
/// one ink.
enum WingtipInk {
    /// A problem's words, said where it happened (ProblemLine).
    static let problem = Color(dynamic(\.destructiveInk))
    /// A caution's words: the owner's warn-never-limit.
    static let caution = Color(dynamic(\.cautionInk))
    /// The tokens' muted fill: where a picture has not come, or there is none.
    static let inactiveFill = Color(dynamic(\.muted))
    /// What is fine.
    static let go = Color(dynamic(\.goInk))
    /// A quiet name in the tokens' muted text colour (color.theme's
    /// mutedForeground), 4.5:1 and more on the sheet's own ground in every
    /// look, where the system's secondary label is not: about 3.3:1 on the
    /// sheet's #f2f2f7 by day (WCAG 2.2 1.4.3; the figure strip's names).
    static let muted = Color(dynamic(\.mutedForeground))
    /// The brand's tint, Sectional Blue, by day and at night: for the
    /// widgets, which have no accent colour of their own to take it from.
    static let tint = Color(dynamic(\.tint))
    /// Words in the tokens' text colour, where the system's .primary is not
    /// to hand (the Live Activity's action buttons, FlightActivityWidget).
    /// The token stays put: #0A0A0A by day, #EEF3F9 at night.
    static let text = Color(dynamic(\.foreground))
    /// The solid surface glass falls back to under Reduce Transparency:
    /// the sheet's own colour, by day or at night.
    static let sheet = Color(dynamic(\.sheet))

    /// The roles by the appearance, and in the Native look (Look's
    /// "native", read by its key so the widgets, which have no Look, build)
    /// iOS's own label, grounds and blue; the states stay the theme's there.
    /// Increase Contrast lifts the grey words as the web's prefers-contrast
    /// does (tokens.css): to sunlight's by day, and at night to sunlight's
    /// night lift on the night's own grounds (color.theme.sunlight-night),
    /// never sunlight's white, which would undo the pilot's dark adaptation
    /// (AIM 8-1-6); the Native look's are iOS's own, which lift themselves.
    private static func dynamic(_ role: KeyPath<WingtipPalette, UIColor>) -> UIColor {
        UIColor { traits in
            let dark = traits.userInterfaceStyle == .dark
            let native = UserDefaults.standard.string(forKey: "look") == "native"
            if traits.accessibilityContrast == .high, !native, role == \WingtipPalette.mutedForeground {
                return (dark ? WingtipPalette.sunlightNight : .sunlight).mutedForeground
            }
            let palette = native ? (dark ? WingtipPalette.nativeDark : .nativeLight) : (dark ? WingtipPalette.dark : .light)
            return palette[keyPath: role].resolvedColor(with: traits)
        }
    }
}
