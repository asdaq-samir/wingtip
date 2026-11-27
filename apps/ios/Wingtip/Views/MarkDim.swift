import MapKit

/// The Dimmer over the map's marks, not the chart's tiles alone, as the
/// web's mapDim (the round-4 phones audit, 2026-11-27: at night the
/// Dimmer darkened the chart while the fields, their weather and the
/// traffic stayed at full light). At night every mark is drawn at the
/// chart's own brightness as its alpha, so nothing on the map is brighter
/// than the chart under it and the pilot's dark adaptation is kept (AIM
/// 8-1-6, Vision in Flight); by day it is 1. Own ship, the GPS's or the
/// dry run's airplane, keeps its full light: the one mark the pilot must
/// find at a glance.
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
        for annotation in map.annotations where dims(annotation) { map.view(for: annotation)?.alpha = alpha }
    }
}

extension ChartMap.Coordinator {
    /// A mark put on the map, or one reused as the map moves, takes the
    /// Dimmer's alpha the others have.
    func mapView(_ mapView: MKMapView, didAdd views: [MKAnnotationView]) {
        let alpha = (mapView as? RaisedMapView)?.markAlpha ?? 1
        for view in views where view.annotation.map(MarkDim.dims) ?? false { view.alpha = alpha }
    }
}
