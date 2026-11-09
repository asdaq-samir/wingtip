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
    /// What is fine.
    static let go = Color(dynamic(\.goInk))
    /// A loading row's bars (Skeleton): the border's grey, as the muted
    /// fill (#F5F5F5) is lost on a list's white row.
    static let skeleton = Color(dynamic(\.border))

    private static func dynamic(_ role: KeyPath<WingtipPalette, UIColor>) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? WingtipPalette.dark[keyPath: role] : WingtipPalette.light[keyPath: role] }
    }
}
