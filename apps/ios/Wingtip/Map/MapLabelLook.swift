import UIKit

/// The map's words after dark and at a larger text size, as the web's map
/// labels are (claude/map-labels, owner recs 25 and 26; rules.md §13.6):
///
/// - After dark, each light-haloed word takes a lighter ink of its own
///   colour on the night's dark halo (NightPalette.halo), Apple Maps' dark
///   map, at least 4.5:1 and with no glare: design/tokens.json's
///   map.label.night-ink, by its day ink (WingtipMapLabel.nightInk).
/// - Larger Map Labels, a switch in the Map card, lets them follow the
///   pilot's text size up to WingtipMapLabel.scaleMax (1.2 times); off,
///   they keep the chart's own sizes, as a printed chart does.
enum MapLabelLook {
    /// The Map card's switch, kept with the app's other map choices.
    static let largerKey = "largerMapLabels"

    static var larger: Bool { UserDefaults.standard.bool(forKey: largerKey) }

    /// The word's ink: its day ink by day, its night ink after dark where
    /// the tokens give one, else the day ink as it was.
    static func ink(_ day: UIColor) -> UIColor {
        guard let night = WingtipMapLabel.nightInk[hex(day)].flatMap(rgb) else { return day }
        return UIColor(light: day, dark: night)
    }

    /// The word's font at its chart size, grown with the pilot's text size
    /// (UIFontMetrics, as Dynamic Type scales body text) only with Larger
    /// Map Labels on, and never past scaleMax times.
    static func font(_ size: CGFloat, weight: UIFont.Weight, traits: UITraitCollection) -> UIFont {
        UIFont.systemFont(ofSize: scaled(size, larger: larger, traits: traits), weight: weight)
    }

    static func scaled(_ size: CGFloat, larger: Bool, traits: UITraitCollection) -> CGFloat {
        guard larger else { return size }
        let grown = UIFontMetrics(forTextStyle: .body).scaledValue(for: size, compatibleWith: traits)
        return min(max(size, grown), size * CGFloat(WingtipMapLabel.scaleMax))
    }

    /// "#2465b8": a colour's sRGB as the tokens key it.
    static func hex(_ colour: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)).getRed(&r, green: &g, blue: &b, alpha: &a)
        func byte(_ c: CGFloat) -> Int { Int((min(max(c, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(r), byte(g), byte(b))
    }

    private static func rgb(_ hex: String) -> UIColor? {
        UIColor(token: hex)
    }
}
