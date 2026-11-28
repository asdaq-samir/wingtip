import MapKit
import UIKit

/// Night: the cockpit palette the owner picked (26 October 2026), the
/// web app's dark theme (design/tokens.json color.theme.dark, generated
/// into WingtipPalette), for the colours the app sets itself -- the map's
/// marks, the chart's dimming. Everything else is the system's, which
/// follows dark appearance by itself; the tint is the look's (Look), set
/// at the root.
nonisolated enum NightPalette {
    /// The night's ground and surface (web --background, --card).
    static let ground = WingtipPalette.dark.background
    static let surface = WingtipPalette.dark.card
    /// Caution and a check passed, at night (web --caution, --go).
    static let caution = WingtipPalette.dark.caution
    static let positive = WingtipPalette.dark.go

    /// The course line's magenta, by day and over a dimmed chart alike,
    /// as the web draws it (its green casing and light edge carry it at
    /// night).
    static let course = WingtipColor.Chart.course

    /// The green either side of a selected course, as ForeFlight cases its
    /// magenta line (the owner's screenshot, 8 November 2026; it shows the
    /// green only when the course is selected, 9 November). Not drawn on
    /// the phone until it has a leg selection; the web's
    /// ROUTE_GREEN and ROUTE_GREEN_NIGHT (lib/map/chartColors): a shade
    /// deeper over the dimmed chart so it does not glare.
    static func routeGreen(night: Bool) -> UIColor {
        night ? WingtipColor.Chart.routeGreenNight.withAlphaComponent(0.9) : WingtipColor.Chart.routeGreen
    }

    /// The thin edge round the course's magenta: the dark rim by day and
    /// at night (the web's CHART.routeEdge), where a light one at night
    /// stood out of the dimmed chart, brighter than the course it edged.
    /// As the web's routeEdgePaint, its weights design/tokens.json's
    /// chart-look.route-edge-*: nearly whole at night, where the magenta
    /// itself is under 3:1 on the dimmed paper and the edge carries the
    /// line (about 4.7:1, WCAG 2.2 1.4.11 counting the adjacent colour);
    /// as whole by day in the sunlight palette, which on iOS is the one
    /// Increase Contrast brings (WingtipInk), the web's Sunlight look; else
    /// lighter on the white chart.
    @MainActor
    static func routeEdge(night: Bool, sunlight: Bool = UIAccessibility.isDarkerSystemColorsEnabled) -> UIColor {
        let weight = night ? WingtipChartLook.routeEdgeNight : sunlight ? WingtipChartLook.routeEdgeSunlight : WingtipChartLook.routeEdgeDay
        return WingtipColor.Chart.routeEdge.withAlphaComponent(weight)
    }

    /// A mark's colour dimmed by colour to `brightness` (OverlayDim.colour),
    /// moved only as far as it must to stand at least `least` to 1 off its
    /// paper (WCAG 2.2 1.4.11's 3:1 for a mark that must be seen): the
    /// brightness nearest the chart's that reaches it, so a warning cue is
    /// never washed into the dimmed chart. Where none reaches it, the
    /// chart's own.
    static func dimmed(_ colour: UIColor, brightness: CGFloat, on paper: UIColor, least: Double = 3) -> UIColor {
        let at = min(1, max(0, brightness))
        for step in 0...100 {
            let d = CGFloat(step) / 100
            for b in [at - d, at + d] where (0...1).contains(b) {
                if let ink = OverlayDim.colour(colour, brightness: b), contrast(ink, paper) >= least { return ink }
            }
        }
        return OverlayDim.colour(colour, brightness: at) ?? colour
    }

    /// The casing under a line on the chart: white by day, the night's
    /// ground over a dimmed chart, where white would be the brightest line
    /// on the screen.
    static func casing(night: Bool) -> UIColor {
        night ? ground.withAlphaComponent(0.85) : UIColor.white.withAlphaComponent(0.85)
    }

    /// The halo behind a mark's words on the chart. By day white round the
    /// label's dark words; in dark appearance the words are light (.label)
    /// and a white halo made them unreadable, so the halo is the tag's
    /// dark at map.label.halo-night's strength, full, as the web's: its
    /// words dimmed by colour at night (MarkDim.word) read about 5:1 on it
    /// at the default Dimmer, where a see-through halo let the dimmed
    /// paper show through.
    static let halo = UIColor(light: UIColor.white.withAlphaComponent(0.9),
                              dark: WingtipColor.Chart.tag.withAlphaComponent(WingtipMapLabel.haloNight))

    /// The fill of a field's ring and own ship's disc on the chart.
    static let markFill = UIColor(light: UIColor.white.withAlphaComponent(0.85), dark: surface.withAlphaComponent(0.9))

    /// Traffic: near (within the alert's band) and the rest, the web app's
    /// amber and cyan, by day and at night.
    static let trafficNear = WingtipColor.Chart.trafficNear
    static let trafficFar = WingtipColor.Chart.trafficFar

    /// WCAG 2's contrast ratio between two opaque colours, 1 to 21, as the
    /// web app's lib/contrast measures its tokens (WCAG 1.4.3 asks 4.5:1
    /// of words).
    static func contrast(_ a: UIColor, _ b: UIColor) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// WCAG 2's relative luminance of a colour in sRGB.
    static func luminance(_ colour: UIColor) -> Double {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.getRed(&r, green: &g, blue: &b, alpha: &a)
        func linear(_ c: CGFloat) -> Double {
            let c = Double(c)
            return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
}

extension UILabel {
    /// A soft halo round a mark's words on the chart, so they read over
    /// any of its colours: NightPalette.halo for the appearance, resolved
    /// here because a layer's colour does not follow it by itself.
    func halo(for traits: UITraitCollection) {
        layer.shadowColor = NightPalette.halo.resolvedColor(with: traits).cgColor
        layer.shadowOffset = .zero
        layer.shadowRadius = 1.5
        layer.shadowOpacity = 1
    }

    /// The halo now and whenever the mark it is on changes appearance:
    /// every mark's words on the chart (fields, traffic) keep it this way.
    func haloFollowing(_ mark: UIView) {
        halo(for: mark.traitCollection)
        mark.registerForTraitChanges([UITraitUserInterfaceStyle.self]) { [weak self] (view: UIView, _: UITraitCollection) in
            self?.halo(for: view.traitCollection)
        }
    }
}

nonisolated extension UIColor {
    /// A colour from its 0xRRGGBB, opaque.
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }

    /// A colour from a token's "#rrggbb" (design/tokens.json's form); nil
    /// for a value that is not one.
    convenience init?(token hex: String) {
        guard hex.hasPrefix("#"), hex.count == 7, let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        self.init(hex: value)
    }

    /// One colour by day and another in dark appearance, resolved by the
    /// view it is drawn in.
    convenience init(light: UIColor, dark: UIColor) {
        self.init { $0.userInterfaceStyle == .dark ? dark : light }
    }
}
