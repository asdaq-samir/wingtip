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

    private static func dynamic(_ role: KeyPath<WingtipPalette, UIColor>) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? WingtipPalette.dark[keyPath: role] : WingtipPalette.light[keyPath: role] }
    }
}
