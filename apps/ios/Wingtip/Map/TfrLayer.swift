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
/// minutes while the app is in front, the web's tfrsQuery; a failed ask
/// again in one, the last answer kept on the map meanwhile.
@MainActor
final class TfrLayer {
    /// The web's tfrsQuery: asked again every ten minutes; a failed ask again in one.
    static let every = Duration.seconds(600), retry = Duration.seconds(60)

    private weak var map: MKMapView?
    private var areas: [TfrPolygon] = []
    private var labels: [TfrLabel] = []
    private var asking: Task<Void, Never>?
    /// What is on the map: the answer and each area's in force, so a
    /// refresh that changes neither redraws nothing.
    private var drawn: Drawn?

    private struct Drawn: Equatable {
        let tfrs: [APITfr]
        let active: [Bool]
    }

    /// One area as plain values, read off the main actor (MKPolygon is
    /// not Sendable): its NOTAM number, in force, its edge and its holes.
    nonisolated struct Outline: Sendable {
        let notamId: String
        let active: Bool
        let edge: [CLLocationCoordinate2D]
        let holes: [[CLLocationCoordinate2D]]
    }

    func attach(_ map: MKMapView) {
        self.map = map
        map.register(TfrLabelView.self, forAnnotationViewWithReuseIdentifier: TfrLabelView.reuse)
        asking = Task { [weak self] in
            while !Task.isCancelled {
                // Not asked while the app is behind another: no fetch and
                // no reading for a map no one sees; looked at again each
                // minute, so a return brings the answer within one.
                guard self?.map?.window?.windowScene?.activationState != .background else {
                    try? await Task.sleep(for: TfrLayer.retry)
                    continue
                }
                let tfrs = try? await Planner.tfrs()
                // Gone with the map: nothing more to ask for.
                guard self != nil else { return }
                if let tfrs { await self?.draw(tfrs, now: Date()) }
                try? await Task.sleep(for: tfrs == nil ? TfrLayer.retry : TfrLayer.every)
            }
        }
    }

    isolated deinit { asking?.cancel() }

    private func draw(_ tfrs: [APITfr], now: Date) async {
        let outlines = await Self.read(tfrs, now: now)
        let next = Drawn(tfrs: tfrs, active: outlines.map(\.active))
        guard let map, next != drawn else { return }
        drawn = next
        map.removeOverlays(areas)
        map.removeAnnotations(labels)
        (areas, labels) = Self.shapes(outlines)
        // Over the chart, its imagery and the hazard tiles, under the
        // course and everything else drawn over the chart: inserted at
        // that place, so a refresh never lays the red over the magenta.
        let ground = map.overlays(in: .aboveLabels).lastIndex {
            $0 is ChartTileOverlay || $0 is CloseImageryOverlay || $0 is HazardTileOverlay
        }
        for (k, area) in areas.enumerated() { map.insertOverlay(area, at: (ground ?? -1) + 1 + k, level: .aboveLabels) }
        map.addAnnotations(labels)
    }

    /// Each TFR's areas read and judged off the main actor: about a
    /// hundred GeoJSON shapes and an engine call each at every refresh.
    @concurrent
    nonisolated static func read(_ tfrs: [APITfr], now: Date) async -> [Outline] { outlines(tfrs, now: now) }

    /// Each TFR's areas, its polygons from its GeoJSON, in force or not.
    nonisolated static func outlines(_ tfrs: [APITfr], now: Date) -> [Outline] {
        tfrs.flatMap { tfr -> [Outline] in
            let active = inForce(tfr, now: now)
            return polygons(tfr.geometry).map { shape in
                Outline(notamId: tfr.notamId, active: active, edge: coordinates(shape), holes: (shape.interiorPolygons ?? []).map(coordinates))
            }
        }
    }

    private nonisolated static func coordinates(_ shape: MKPolygon) -> [CLLocationCoordinate2D] {
        var points = [CLLocationCoordinate2D](repeating: .init(), count: shape.pointCount)
        shape.getCoordinates(&points, range: NSRange(location: 0, length: shape.pointCount))
        return points
    }

    /// The areas on the map, and each TFR's number at the northernmost
    /// point of its first area's edge.
    static func shapes(_ outlines: [Outline]) -> (areas: [TfrPolygon], labels: [TfrLabel]) {
        var areas: [TfrPolygon] = [], labels: [TfrLabel] = []
        for outline in outlines {
            let holes = outline.holes.map { MKPolygon(coordinates: $0, count: $0.count) }
            let area = TfrPolygon(coordinates: outline.edge, count: outline.edge.count, interiorPolygons: holes)
            area.notamId = outline.notamId
            area.active = outline.active
            if areas.last?.notamId != outline.notamId, let top = outline.edge.max(by: { $0.latitude < $1.latitude }) {
                labels.append(TfrLabel(outline.notamId, at: top))
            }
            areas.append(area)
        }
        return (areas, labels)
    }

    static func shapes(_ tfrs: [APITfr], now: Date) -> (areas: [TfrPolygon], labels: [TfrLabel]) {
        shapes(outlines(tfrs, now: now))
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
