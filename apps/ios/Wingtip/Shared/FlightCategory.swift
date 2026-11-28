import SwiftUI
import UIKit

/// A flight category's colours, the one set the app and its widgets draw
/// (design/tokens.json color.category, the web's lib/map/flightCategory.ts):
/// VFR green, MVFR blue, IFR red, LIFR magenta, grey with no report. The
/// Three sets across the apps and the
/// LIFR chip's white words at 3.35:1 on the map's lighter magenta; words
/// on or in a category's colour take `words`, whose LIFR is the deeper
/// #7E3FB8 (6.38:1 with white, WCAG 2.2 AA 1.4.3), while a mark with no
/// words (a pip, a ring) keeps the chart's own `mark`.
enum FlightCategory {
    /// A pip's or a ring's colour, words beside it rather than on it.
    static func mark(_ category: String?) -> UIColor {
        switch category?.uppercased() {
        case "VFR": WingtipColor.Category.vfr
        case "MVFR": WingtipColor.Category.mvfr
        case "IFR": WingtipColor.Category.ifr
        case "LIFR": WingtipColor.Category.lifr
        default: WingtipColor.Category.unknown
        }
    }

    /// A chip's fill under white words.
    static func words(_ category: String?) -> UIColor {
        category?.uppercased() == "LIFR" ? WingtipColor.Category.lifrChip : mark(category)
    }

    /// A category set as words with no chip under them: the scheme's ink,
    /// the mark's hue at 4.5:1 and more on every surface by day and a
    /// lighter one at night (color.theme's category-*-ink; the owner,
    /// 2026-11-27: "Lighter word colour at night"), where the FAA colours
    /// were 1.9 to 4.0:1 on the night's surfaces.
    static func ink(_ category: String?) -> UIColor {
        let role: KeyPath<WingtipPalette, UIColor> = switch category?.uppercased() {
        case "VFR": \.categoryVfrInk
        case "MVFR": \.categoryMvfrInk
        case "IFR": \.categoryIfrInk
        case "LIFR": \.categoryLifrInk
        default: \.categoryUnknownInk
        }
        // Resolved by the view it is drawn in (the widgets have no NightPalette).
        return UIColor { ($0.userInterfaceStyle == .dark ? WingtipPalette.dark : WingtipPalette.light)[keyPath: role] }
    }
}
