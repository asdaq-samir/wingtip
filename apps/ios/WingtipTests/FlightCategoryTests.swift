import Testing
import UIKit
@testable import Wingtip

/// The flight categories' one colour set, and white words on each chip
/// readable at WCAG 2.2 AA's 4.5:1 (1.4.3): the audit of 2026-11-09 found
/// the LIFR chip at 3.35:1.
@Suite struct FlightCategoryTests {
    /// WCAG's relative luminance of an sRGB colour.
    private static func luminance(_ colour: UIColor) -> Double {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.getRed(&r, green: &g, blue: &b, alpha: &a)
        func linear(_ c: CGFloat) -> Double { let c = Double(c); return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }

    @Test(arguments: ["VFR", "MVFR", "IFR", "LIFR"])
    func whiteWordsOnEveryCategorysChipPassAA(category: String) {
        let ratio = 1.05 / (Self.luminance(FlightCategory.words(category)) + 0.05)
        #expect(ratio >= 4.5, "\(category) chip at \(ratio):1")
    }

    @Test func theMarksAreTheTokensAndOnlyLIFRsWordsAreDeeper() {
        #expect(FlightCategory.mark("lifr") == WingtipColor.Category.lifr)
        #expect(FlightCategory.words("LIFR") == WingtipColor.Category.lifrChip)
        #expect(FlightCategory.words("VFR") == FlightCategory.mark("VFR"))
        #expect(FlightCategory.mark(nil) == WingtipColor.Category.unknown)
    }

    /// A category set as words: the scheme's ink, 4.5:1 and more on the
    /// sheet and the card by day and at night (the owner, 2026-11-27:
    /// "Lighter word colour at night"), where MVFR's mark is 4.15:1 on the
    /// day's sheet and 2.7 to 4.0:1 on the night's surfaces.
    @Test(arguments: ["VFR", "MVFR", "IFR", "LIFR", nil] as [String?])
    func aCategorysWordsReadOnEverySurface(category: String?) {
        for (style, palette) in [(UIUserInterfaceStyle.light, WingtipPalette.light), (.dark, WingtipPalette.dark)] {
            let ink = FlightCategory.ink(category).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
            for surface in [palette.sheet, palette.card, palette.background] {
                let ratio = NightPalette.contrast(ink, surface.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)))
                #expect(ratio >= 4.5, "\(category ?? "none") at \(ratio):1")
            }
        }
    }
}
