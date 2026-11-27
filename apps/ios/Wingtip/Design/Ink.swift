import SwiftUI
import Synchronization
import UIKit

/// The tokens' states as SwiftUI colours that follow the appearance: the
/// light palette by day, the dark at night (design/tokens.json color.theme,
/// generated into WingtipPalette). A screen asks for the role, never a
/// system colour, so the web and the phones say a problem or a caution in
/// one ink.
nonisolated enum WingtipInk {
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

    /// The roles by the appearance in the picked look, its own palette's:
    /// Wingtip's, Glass Cockpit's, Chart Ink's (the web's cream sheet and
    /// its brown muted words) or Native's, iOS's own label, grounds and
    /// blue. Increase Contrast lifts the grey words and the edges as the
    /// web's prefers-contrast does (tokens.css, its muted foreground,
    /// border and input): to sunlight's by day, and at night to sunlight's
    /// night lift on the night's own grounds (color.theme.sunlight-night),
    /// never sunlight's white, which would undo the pilot's dark adaptation
    /// (AIM 8-1-6); the Native look's are iOS's own, which lift themselves.
    private static func dynamic(_ role: KeyPath<WingtipPalette, UIColor>) -> UIColor {
        UIColor { traits in
            let dark = traits.userInterfaceStyle == .dark
            let look = picked
            if traits.accessibilityContrast == .high, look != "native", lifts(role) {
                return (dark ? WingtipPalette.sunlightNight : .sunlight)[keyPath: role]
            }
            return palette(look, dark: dark)[keyPath: role].resolvedColor(with: traits)
        }
    }

    private static func lifts(_ role: KeyPath<WingtipPalette, UIColor>) -> Bool {
        role == \.mutedForeground || role == \.border || role == \.input
    }

    /// A look's palette by its kept name (Look's raw values, read by name
    /// so the widgets, which have no Look, build).
    private static func palette(_ look: String, dark: Bool) -> WingtipPalette {
        switch look {
        case "native": dark ? .nativeDark : .nativeLight
        case "cockpit": dark ? .cockpitDark : .cockpitLight
        case "ink": dark ? .inkDark : .inkLight
        default: dark ? .dark : .light
        }
    }

    /// The look picked, read from the defaults once and kept in step by the
    /// app's root as Setup changes it (`keep`): a colour resolves on every
    /// trait change in every view, on render threads too, and reads no
    /// defaults there.
    private static let kept = Mutex<String?>(nil)

    private static var picked: String {
        kept.withLock { name in
            if let name { return name }
            let read = UserDefaults.standard.string(forKey: "look") ?? "wingtip"
            name = read
            return read
        }
    }

    /// The look Setup picked, for the colours resolved after it.
    static func keep(look: String) { kept.withLock { $0 = look } }
}
