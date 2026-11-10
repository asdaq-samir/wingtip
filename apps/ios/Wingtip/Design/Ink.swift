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
    /// An inactive control's words and fill: the tokens' muted words on the
    /// muted fill (5.2:1), where the system's dimmed prominent button
    /// failed the accessibility audit's contrast check (the Airplane
    /// tab's Fly before an N-number is typed, 2026-11-09).
    static let inactive = Color(dynamic(\.mutedForeground))
    static let inactiveFill = Color(dynamic(\.muted))
    /// What is fine.
    static let go = Color(dynamic(\.goInk))
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
    /// A loading row's bars (Skeleton): the border's grey, as the muted
    /// fill (#F5F5F5) is lost on a list's white row.
    static let skeleton = Color(dynamic(\.border))

    private static func dynamic(_ role: KeyPath<WingtipPalette, UIColor>) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? WingtipPalette.dark[keyPath: role] : WingtipPalette.light[keyPath: role] }
    }
}

/// The bordered prominent button's capsule in the tint, with the tokens'
/// inactive ink while it is disabled (WingtipInk.inactive), so an
/// inactive Fly still reads as words: the system's own dimmed look was
/// too faint for the accessibility audit.
struct ProminentButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.semibold)
            .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
            .foregroundStyle(isEnabled ? Color.white : WingtipInk.inactive)
            .background(isEnabled ? AnyShapeStyle(.tint) : AnyShapeStyle(WingtipInk.inactiveFill), in: .capsule)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
