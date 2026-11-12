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
    /// The brand's tint, Sectional Blue, by day and at night: for the
    /// widgets, which have no accent colour of their own to take it from.
    static let tint = Color(dynamic(\.tint))
    /// Words in the tokens' text colour, for text on clear glass over the
    /// map (the iPad's figures, FiguresStrip): there the system's .primary
    /// and .secondary turn vibrant and take on the chart behind, and the
    /// accessibility audit of 2026-11-09 found the figures' names, and
    /// even their dashes, under 4.5:1 (WCAG 2.2 1.4.3). The token stays
    /// put: #0A0A0A by day, #EEF3F9 at night.
    static let text = Color(dynamic(\.foreground))
    /// The solid surface glass falls back to under Reduce Transparency:
    /// the sheet's own colour, by day or at night.
    static let sheet = Color(dynamic(\.sheet))
    /// A badge's grounds and words, as the web's stock Badge variants have
    /// them (TextBadge): the destructive's red, the caution's wash under its
    /// ink, and the secondary's quiet fill, with the muted words for what
    /// is not in force.
    static let destructive = Color(dynamic(\.destructive))
    static let cautionWash = Color(dynamic(\.cautionWash))
    static let secondary = Color(dynamic(\.secondary))
    static let secondaryText = Color(dynamic(\.secondaryForeground))
    static let mutedText = Color(dynamic(\.mutedForeground))

    /// The roles by the appearance, and in the Native look (Look's
    /// "native", read by its key so the widgets, which have no Look, build)
    /// iOS's own label, grounds and blue; the states stay the theme's there.
    private static func dynamic(_ role: KeyPath<WingtipPalette, UIColor>) -> UIColor {
        UIColor { traits in
            let dark = traits.userInterfaceStyle == .dark
            let native = UserDefaults.standard.string(forKey: "look") == "native"
            let palette = native ? (dark ? WingtipPalette.nativeDark : .nativeLight) : (dark ? WingtipPalette.dark : .light)
            return palette[keyPath: role].resolvedColor(with: traits)
        }
    }
}
