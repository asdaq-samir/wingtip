import MapKit
import UIKit

/// Night: the cockpit palette the owner picked (26 October 2026), the
/// web app's dark theme (design/tokens.json color.theme.dark, generated
/// into WingtipPalette), for the colours the app sets itself -- the map's
/// marks, the chart's dimming. Everything else is the system's, which
/// follows dark appearance by itself; the tint is the look's (Look), set
/// at the root.
enum NightPalette {
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

    /// The thin edge round the course's magenta: dark by day, faint and
    /// light over the dimmed chart, where dark would vanish (web
    /// routeEdgePaint).
    static func routeEdge(night: Bool) -> UIColor {
        night ? UIColor.white.withAlphaComponent(0.35) : WingtipColor.Chart.routeEdge.withAlphaComponent(0.6)
    }

    /// The casing under a line on the chart: white by day, the night's
    /// ground over a dimmed chart, where white would be the brightest line
    /// on the screen.
    static func casing(night: Bool) -> UIColor {
        night ? ground.withAlphaComponent(0.85) : UIColor.white.withAlphaComponent(0.85)
    }

    /// The halo behind a mark's words on the chart. By day white round the
    /// label's dark words; in dark appearance the words are light (.label)
    /// and a white halo made them unreadable, so the halo is the night's
    /// ground.
    static let halo = UIColor(light: UIColor.white.withAlphaComponent(0.9), dark: ground.withAlphaComponent(0.9))

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

/// The chart in dark appearance, from Setup: as printed, or dimmed so the
/// white paper chart does not take the pilot's night vision. Dimmed unless
/// asked otherwise, as the web app's Settings has it (Chart at night).
enum ChartNight: String, CaseIterable, Identifiable {
    case normal, dimmed

    /// The key Setup and the map share, as the web app's preference.
    static let key = "chartAtNight"

    var id: String { rawValue }
    var label: String { self == .normal ? "Normal" : "Dimmed" }

    /// How much of the night's ground is laid over each tile: none by day
    /// or as printed; at night the paper down to about a fifth of its
    /// light, as the web app's brightness(0.5) filter takes it, its black
    /// type still 5:1 on it.
    func shade(dark: Bool) -> CGFloat { dark && self == .dimmed ? 0.5 : 0 }
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

extension UIColor {
    /// A colour from its 0xRRGGBB, opaque.
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }

    /// One colour by day and another in dark appearance, resolved by the
    /// view it is drawn in.
    convenience init(light: UIColor, dark: UIColor) {
        self.init { $0.userInterfaceStyle == .dark ? dark : light }
    }
}
