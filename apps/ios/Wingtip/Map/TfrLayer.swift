import MapKit
import UIKit

/// One TFR's area on the map: its NOTAM number and whether it is in force.
final nonisolated class TfrPolygon: MKPolygon {
    var notamId = ""
    var active = true
}

/// A TFR's NOTAM number on its northern edge, as a chart's area carries
/// its name: the number the pilot is briefed by and looks it up with.
final class TfrLabel: NSObject, MKAnnotation {
    let coordinate: CLLocationCoordinate2D
    let notamId: String

    init(_ notamId: String, at coordinate: CLLocationCoordinate2D) {
        self.notamId = notamId
        self.coordinate = coordinate
    }
}

/// The temporary flight restrictions on the map, always, as the web's
/// TfrGl draws them: a hazard a pilot must know of near the route (14 CFR
/// 91.103), with no switch to lose it by (the owner, 2026-11-14; "Yes,
/// port now", 2026-11-27). Each area in the FAA's TFR red (chart.tfr): in
/// force a solid edge over a red wash, not yet in force a dashed edge over
/// a fainter one; the NOTAM number on its edge. The edges, the washes and
/// the numbers are dimmed by colour at night with the chart (OverlayDim,
/// NightWords; the owner's "Dim by colour", about 3:1 at the default
/// Dimmer). Asked of the planner (/api/tfrs) as the map opens and every ten
/// minutes, the web's tfrsQuery; a failed ask again in one, the last
/// answer kept on the map meanwhile.
@MainActor
final class TfrLayer {
    /// The web's tfrsQuery: asked again every ten minutes; a failed ask again in one.
    static let every = Duration.seconds(600), retry = Duration.seconds(60)

    private weak var map: MKMapView?
    private var areas: [TfrPolygon] = []
    private var labels: [TfrLabel] = []
    private var asking: Task<Void, Never>?

    func attach(_ map: MKMapView) {
        self.map = map
        map.register(TfrLabelView.self, forAnnotationViewWithReuseIdentifier: TfrLabelView.reuse)
        asking = Task { [weak self] in
            while !Task.isCancelled {
                let tfrs = try? await Planner.tfrs()
                // Gone with the map: nothing more to ask for.
                guard self != nil else { return }
                if let tfrs { self?.draw(tfrs, now: Date()) }
                try? await Task.sleep(for: tfrs == nil ? TfrLayer.retry : TfrLayer.every)
            }
        }
    }

    isolated deinit { asking?.cancel() }

    private func draw(_ tfrs: [APITfr], now: Date) {
        guard let map else { return }
        map.removeOverlays(areas)
        map.removeAnnotations(labels)
        (areas, labels) = Self.shapes(tfrs, now: now)
        // Over the chart and the airspace, under the course (added before it is drawn again).
        map.addOverlays(areas, level: .aboveLabels)
        map.addAnnotations(labels)
    }

    /// Each TFR's areas, its polygons from its GeoJSON, and its number at
    /// the northernmost point of its first area's edge.
    static func shapes(_ tfrs: [APITfr], now: Date) -> (areas: [TfrPolygon], labels: [TfrLabel]) {
        var areas: [TfrPolygon] = [], labels: [TfrLabel] = []
        for tfr in tfrs {
            let active = inForce(tfr, now: now)
            let polygons = self.polygons(tfr.geometry).map { shape -> TfrPolygon in
                var points = [CLLocationCoordinate2D](repeating: .init(), count: shape.pointCount)
                shape.getCoordinates(&points, range: NSRange(location: 0, length: shape.pointCount))
                let area = TfrPolygon(coordinates: points, count: points.count, interiorPolygons: shape.interiorPolygons)
                area.notamId = tfr.notamId
                area.active = active
                return area
            }
            areas += polygons
            if let first = polygons.first, let top = (0..<first.pointCount).map({ first.points()[$0].coordinate }).max(by: { $0.latitude < $1.latitude }) {
                labels.append(TfrLabel(tfr.notamId, at: top))
            }
        }
        return (areas, labels)
    }

    /// The polygons of a TFR's GeoJSON geometry (a Polygon or a
    /// MultiPolygon), by MapKit's own GeoJSON reader; none where it reads none.
    nonisolated static func polygons(_ geometry: APITfr.GeometryPayload) -> [MKPolygon] {
        guard let data = try? JSONEncoder().encode(geometry),
              let read = try? MKGeoJSONDecoder().decode(data) else { return [] }
        return read.flatMap { object -> [MKPolygon] in
            if let polygon = object as? MKPolygon { return [polygon] }
            if let many = object as? MKMultiPolygon { return many.polygons }
            return []
        }
    }

    /// Whether a TFR is in force now, by the engine's gonogo_tfr_when, the
    /// one rule the planner's Go / No-Go reads it by; a time that does not
    /// read is no bound. Drawn in force where the engine cannot say: the
    /// safe side, never a restriction drawn as only coming.
    nonisolated static func inForce(_ tfr: APITfr, now: Date) -> Bool {
        func us(_ iso: String?) -> Double? { AirportWords.date(iso).map { $0.timeIntervalSince1970 * 1_000_000 } }
        guard let when = try? Engine.gonogoTfrWhen(atUs: now.timeIntervalSince1970 * 1_000_000, effectiveUs: us(tfr.effective),
                                                   expiresUs: us(tfr.expires)) else { return true }
        return when == "in-force"
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        guard let area = overlay as? TfrPolygon else { return nil }
        let renderer = MKPolygonRenderer(polygon: area)
        let red = WingtipColor.Chart.tfr
        renderer.fillColor = red.withAlphaComponent(area.active ? 0.14 : 0.06)
        renderer.strokeColor = red
        renderer.lineWidth = area.active ? 2.5 : 2
        renderer.lineJoin = .round
        if !area.active { renderer.lineDashPattern = [6, 5] }
        return renderer
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        guard let label = annotation as? TfrLabel else { return nil }
        let view = map.dequeueReusableAnnotationView(withIdentifier: TfrLabelView.reuse, for: label) as? TfrLabelView
        view?.show(label)
        return view
    }
}

/// A TFR's number in its red on the chart's halo, a light ink of it after
/// dark (MapLabelLook), dimmed by colour on its opaque halo at night.
final class TfrLabelView: MKAnnotationView, NightWords {
    static let reuse = "tfr-label"
    private let label = NightWordLabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        label.font = UIFont.systemFont(ofSize: WingtipMapLabel.sizeSmall, weight: .bold)
        label.ink = MapLabelLook.ink(WingtipColor.Chart.tfr)
        label.haloFollowing(self)
        addSubview(label)
        canShowCallout = false
        isEnabled = false
        displayPriority = .defaultHigh
        collisionMode = .rectangle
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func show(_ mark: TfrLabel) {
        label.text = mark.notamId
        label.sizeToFit()
        frame = CGRect(origin: .zero, size: label.bounds.size)
        accessibilityLabel = "Temporary flight restriction \(mark.notamId)"
    }

    func dim(_ brightness: CGFloat) { label.brightness = brightness }
}
