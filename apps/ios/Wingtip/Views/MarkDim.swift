import MapKit

/// The Dimmer over the map's marks, not the chart's tiles alone, as the
/// web's mapDim (at night the
/// Dimmer darkened the chart while the fields, their weather and the
/// traffic stayed at full light).
/// At night every mark is drawn at the
/// chart's own brightness as its alpha, so nothing on the map is brighter
/// than the chart under it and the pilot's dark adaptation is kept (AIM
/// 8-1-6, Vision in Flight); by day it is 1. Own ship, the GPS's or the
/// dry run's airplane, keeps its full light: the one mark the pilot must
/// find at a glance. The policy's figures are design/tokens.json's map-dim
/// group (WingtipDimmer), and apps/web/src/lib/fixtures/mapDim.json holds
/// this to the web's and Android's cases (MarkDimTests).
enum MarkDim {
    /// The marks' alpha: the chart's brightness, one less the Dimmer's
    /// shade, at night; 1 by day (the web's mapDimOf).
    nonisolated static func alpha(shade: CGFloat, night: Bool) -> CGFloat {
        night ? min(1, max(0, 1 - shade)) : 1
    }

    /// Every mark but own ship's.
    static func dims(_ annotation: any MKAnnotation) -> Bool {
        !(annotation is MKUserLocation) && !(annotation is PlaneAnnotation)
    }

    /// The marks on the map at this alpha, kept on the map for those put
    /// on it later (ChartMap.Coordinator's didAdd).
    static func apply(_ alpha: CGFloat, on map: MKMapView) {
        guard let raised = map as? RaisedMapView, raised.markAlpha != alpha else { return }
        raised.markAlpha = alpha
        for annotation in map.annotations where dims(annotation) {
            if let view = map.view(for: annotation) { dim(view, alpha) }
        }
    }

    /// One mark at the chart's brightness: one with words dims them by
    /// colour itself (NightWords), the rest by their alpha.
    static func dim(_ view: MKAnnotationView, _ brightness: CGFloat) {
        if let words = view as? NightWords {
            view.alpha = 1
            words.dim(brightness)
        } else {
            view.alpha = brightness
        }
    }

    /// A word's ink at the chart's brightness, dimmed by colour on its
    /// opaque dark halo, as the web's labelInk: its night ink (already
    /// brought to the towered blue's light, MapLabelLook.ink) times the
    /// words' share of light (WordLight), so a word is as light as the
    /// paper under the Dimmer and none brighter (AIM 8-1-6), about 5:1 on
    /// its halo at the night's default Dimmer. iOS draws its chart's
    /// contrast itself, so the share is taken at the night's own contrast
    /// (map-dim.word-floor-contrast), where the web follows its slider.
    nonisolated static func word(_ ink: UIColor, brightness: CGFloat) -> UIColor {
        guard brightness < 1 else { return ink }
        let share = WordLight.share(brightness: Double(brightness), contrast: WingtipDimmer.wordFloorContrast)
        return OverlayDim.colour(ink, brightness: CGFloat(share)) ?? ink
    }
}

/// A mark with words on the chart's halo: at night its words are dimmed
/// by colour and the halo kept opaque (MarkDim.word), its other parts by
/// their alpha, so the words keep their contrast with the halo.
protocol NightWords: MKAnnotationView {
    func dim(_ brightness: CGFloat)
}

/// A mark's words: the ink its mark gives, shown at the chart's
/// brightness (MarkDim.word); the halo on its layer is untouched.
final class NightWordLabel: UILabel {
    var ink: UIColor = .label {
        didSet { paint() }
    }

    var brightness: CGFloat = 1 {
        didSet { if brightness != oldValue { paint() } }
    }

    private func paint() { textColor = MarkDim.word(ink, brightness: brightness) }
}

extension ChartMap.Coordinator {
    /// A mark put on the map, or one reused as the map moves, takes the
    /// Dimmer's alpha the others have.
    func mapView(_ mapView: MKMapView, didAdd views: [MKAnnotationView]) {
        let alpha = (mapView as? RaisedMapView)?.markAlpha ?? 1
        for view in views where view.annotation.map(MarkDim.dims) ?? false { MarkDim.dim(view, alpha) }
    }
}

/// A renderer that takes the night's dim itself (OverlayDim), where its
/// alpha or its colours are its own to set: the model weather's picture,
/// the hazard's obstacle dots.
nonisolated protocol NightDimmed: AnyObject {
    func dim(brightness: CGFloat)
}

/// The night's dim on what is drawn over the chart, as the web's mapDim
/// (at night the course, the
/// airspace, the special-use areas, the weather and the obstacles stayed
/// at full light over the dimmed chart).
/// Lines and areas are dimmed by
/// their colour, the colour times the chart's brightness with its alpha
/// kept (the web's DIM_BY_COLOUR; the owner's "Dim by colour" for the
/// warnings), so they keep their contrast with the chart where an opacity
/// would wash them into it: the course's magenta about 2.7 to 1 over the
/// paper at the night's default Dimmer, where see-through it was 1.04 to
/// 1. The weather loop is dimmed by its opacity. Never dimmed: the chart's
/// tiles (their own shade), the plate (its own look), the close imagery
/// (its fade by zoom) and the terrain hazard's tint, a warning kept as
/// conspicuous as own ship is.
@MainActor
final class OverlayDim {
    private final class Base {
        var stroke: UIColor?, fill: UIColor?
        init(_ path: MKOverlayPathRenderer) { (stroke, fill) = (path.strokeColor, path.fillColor) }
    }

    /// Each line's own colours, kept while MapKit keeps its renderer.
    private let kept = NSMapTable<MKOverlayPathRenderer, Base>.weakToStrongObjects()
    /// The chart's brightness: one less the Dimmer's shade at night, 1 by day (MarkDim.alpha).
    private(set) var brightness: CGFloat = 1

    /// The night's appearance, the colours resolved by it (made once: the
    /// obstacles ask for their colours on MapKit's render threads).
    private nonisolated static let dark = UITraitCollection(userInterfaceStyle: .dark)

    /// A colour times the brightness, its alpha kept; itself at 1.
    nonisolated static func colour(_ colour: UIColor?, brightness: CGFloat) -> UIColor? {
        guard let colour, brightness < 1 else { return colour }
        // The brightness of hue, saturation and brightness times k is each
        // of red, green and blue times k: the colour towards black.
        var h: CGFloat = 0, s: CGFloat = 0, v: CGFloat = 0, a: CGFloat = 0
        guard colour.resolvedColor(with: dark).getHue(&h, saturation: &s, brightness: &v, alpha: &a) else { return colour }
        return UIColor(hue: h, saturation: s, brightness: v * min(1, max(0, brightness)), alpha: a)
    }

    /// A renderer MapKit has just been given, at the dim now.
    func take(_ renderer: MKOverlayRenderer) -> MKOverlayRenderer {
        if let own = renderer as? NightDimmed {
            own.dim(brightness: brightness)
        } else if let path = renderer as? MKOverlayPathRenderer {
            let base = Base(path)
            kept.setObject(base, forKey: path)
            paint(path, base)
        }
        return renderer
    }

    /// The Dimmer moved, or the night came or went: every line and area
    /// on the map drawn again at the chart's brightness.
    func set(_ next: CGFloat, on map: MKMapView) {
        guard next != brightness else { return }
        brightness = next
        for overlay in map.overlays {
            guard let renderer = map.renderer(for: overlay) else { continue }
            if let own = renderer as? NightDimmed {
                own.dim(brightness: next)
            } else if let loop = overlay as? LoopTileOverlay {
                if renderer.alpha > 0 { renderer.alpha = WeatherLoopLayer.alpha(radar: loop.radar, brightness: next) }
            } else if let path = renderer as? MKOverlayPathRenderer, let base = kept.object(forKey: path) {
                paint(path, base)
                path.setNeedsDisplay()
            }
        }
    }

    /// A line whose own colour changes with the night (the course's edge,
    /// the selected leg's green): its new colour kept as its base and shown
    /// at the dim now, never written over the dim.
    func recolour(_ path: MKOverlayPathRenderer, stroke: UIColor) {
        let base = kept.object(forKey: path) ?? Base(path)
        base.stroke = stroke
        kept.setObject(base, forKey: path)
        paint(path, base)
        path.setNeedsDisplay()
    }

    private func paint(_ path: MKOverlayPathRenderer, _ base: Base) {
        path.strokeColor = Self.colour(base.stroke, brightness: brightness)
        path.fillColor = Self.colour(base.fill, brightness: brightness)
    }
}

extension ChartMap.Coordinator {
    /// Every overlay's renderer (made), taken by the night's dim.
    func mapView(_ mapView: MKMapView, rendererFor overlay: any MKOverlay) -> MKOverlayRenderer {
        overlayDim.take(made(mapView, for: overlay))
    }
}
