import SwiftUI
import UIKit

/// A flight category's colours, the one set the app and its widgets draw
/// (design/tokens.json color.category, the web's lib/map/flightCategory.ts):
/// VFR green, MVFR blue, IFR red, LIFR magenta, grey with no report. The
/// UI audit of 2026-11-09 (item 6) found three sets across the apps and the
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

    /// A chip's fill under white words, or the words' own colour.
    static func words(_ category: String?) -> UIColor {
        category?.uppercased() == "LIFR" ? WingtipColor.Category.lifrChip : mark(category)
    }
}
