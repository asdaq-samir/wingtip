import MapKit

/// The course's lines on the map, as the web draws them: the magenta core
/// and the thin dark edge round it, the legs a Brief hazard is on, and a
/// picked procedure's path. Each is dimmed by its colour with the chart at
/// night (OverlayDim) once MapKit takes its renderer.
@MainActor
enum CourseRenderers {
    /// The course's two strokes, points, as the web draws them where a
    /// pilot reads a leg (glStyle's widths at zoom 10): the magenta core
    /// and the thin edge round it.
    static let courseWidth: CGFloat = 4.5, edgeWidth: CGFloat = 6.5

    /// How long the Dimmer stands still before the lines are recoloured,
    /// the web's useSettledMapDim.
    static let settle = Duration.milliseconds(120)

    /// The renderer of one of the course's lines; nil for any other overlay.
    static func renderer(for overlay: any MKOverlay, night: Bool) -> MKOverlayRenderer? {
        if let edge = overlay as? CourseEdgePolyline {
            let renderer = CourseEdgeRenderer(polyline: edge, night: night)
            renderer.lineWidth = edgeWidth
            renderer.lineJoin = .round
            renderer.lineCap = .round
            return renderer
        }
        if let hazard = overlay as? HazardPolyline {
            // The legs a hazard tapped in the Brief is on, wide in
            // amber under the course (HazardLegsViews.swift).
            let renderer = HazardLegRenderer(polyline: hazard)
            renderer.lineWidth = 10
            renderer.lineCap = .round
            renderer.lineJoin = .round
            return renderer
        }
        if let procedure = overlay as? ProcedurePolyline {
            // A procedure's path in the chart's procedure violet, as
            // the web app draws a picked one.
            let renderer = MKPolylineRenderer(polyline: procedure)
            renderer.strokeColor = WingtipColor.Chart.procedure
            renderer.lineWidth = 3
            renderer.lineJoin = .round
            return renderer
        }
        if let line = overlay as? MKPolyline {
            // The web app's magenta course line, dimmed by its colour
            // with the chart at night (OverlayDim).
            let renderer = MKPolylineRenderer(polyline: line)
            renderer.strokeColor = NightPalette.course
            renderer.lineWidth = courseWidth
            renderer.lineJoin = .round
            renderer.lineCap = .round
            return renderer
        }
        return nil
    }
}

/// A Brief hazard's legs, a warning cue the pilot asked for: by day the
/// amber at 0.6 over the white chart, as the web draws it; at night solid
/// and dimmed by colour, but only as far as it stays 3:1 off the dimmed
/// paper (NightPalette.dimmed), where the see-through amber dimmed with
/// the chart was 1.34:1 (themes round 7, R7-6). Unchecked: MKOverlayRenderer
/// is not Sendable; it is coloured on the main actor alone, by OverlayDim.
final nonisolated class HazardLegRenderer: MKPolylineRenderer, NightDimmed, @unchecked Sendable {
    override init(polyline: MKPolyline) {
        super.init(polyline: polyline)
        strokeColor = Self.ink(brightness: 1)
    }

    func dim(brightness: CGFloat) {
        strokeColor = Self.ink(brightness: brightness)
        setNeedsDisplay()
    }

    /// The amber at the chart's brightness: the day's at full light, else solid on
    /// the chart's paper shaded as ChartTileRenderer shades it.
    static func ink(brightness: CGFloat) -> UIColor {
        let amber = WingtipColor.Chart.caution
        guard brightness < 1 else { return amber.withAlphaComponent(0.6) }
        return NightPalette.dimmed(amber, brightness: brightness, on: PageLook(shade: 1 - brightness).shadedPaper)
    }
}

/// The course's edge, which takes its weight again as Increase Contrast is
/// turned while the map is up (NightPalette.routeEdge's sunlight weight),
/// not only when it is made. At night its weight is the night's whatever
/// the setting; the night's turn recolours it (`turn`, ChartMap's dim).
/// Unchecked: MKOverlayRenderer is not Sendable; it is coloured on the
/// main thread alone, where the notice comes.
final nonisolated class CourseEdgeRenderer: MKPolylineRenderer, @unchecked Sendable {
    private var night: Bool

    @MainActor
    init(polyline: CourseEdgePolyline, night: Bool) {
        self.night = night
        super.init(polyline: polyline)
        strokeColor = NightPalette.routeEdge(night: night)
        NotificationCenter.default.addObserver(self, selector: #selector(contrastChanged),
                                               name: UIAccessibility.darkerSystemColorsStatusDidChangeNotification, object: nil)
    }

    /// The night came or went: its colour kept as its base under the dim.
    @MainActor
    func turn(night: Bool, dim: OverlayDim) {
        self.night = night
        dim.recolour(self, stroke: NightPalette.routeEdge(night: night))
    }

    @objc private func contrastChanged() {
        MainActor.assumeIsolated {
            guard !night else { return }
            // By day the chart is not dimmed: the colour is the base itself.
            strokeColor = NightPalette.routeEdge(night: false)
            setNeedsDisplay()
        }
    }
}
