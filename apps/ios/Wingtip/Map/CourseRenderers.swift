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
            let renderer = MKPolylineRenderer(polyline: edge)
            renderer.strokeColor = NightPalette.routeEdge(night: night)
            renderer.lineWidth = edgeWidth
            renderer.lineJoin = .round
            renderer.lineCap = .round
            return renderer
        }
        if let hazard = overlay as? HazardPolyline {
            // The legs a hazard tapped in the Brief is on, wide in
            // amber under the course (HazardLegsViews.swift).
            let renderer = MKPolylineRenderer(polyline: hazard)
            renderer.strokeColor = WingtipColor.Chart.caution.withAlphaComponent(0.6)
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
