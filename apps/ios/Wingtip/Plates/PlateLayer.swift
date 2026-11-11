import MapKit
import UIKit

/// The map's part for the approach plates, kept by MapExtrasState: each
/// approach on the route drawn as its whole plate page where the planner
/// places it, the tags on its fixes and its final segment, the card's look
/// on all of them, and a tap on a page opening its card.
@MainActor
final class PlateLayer: NSObject, UIGestureRecognizerDelegate {
    /// A page tapped: its card, by the plate's key.
    var onPlate: ((String) -> Void)?
    /// Whether a tap is the course's (RouteLegLayer): a leg's card wins
    /// over the page under it.
    var tapIsCourse: ((CGPoint, MKMapView) -> Bool)?
    private(set) var look = PlateLook()
    private var keys: [String] = []
    private(set) var pages: [String: PlateMapOverlay] = [:]
    private var renderers: [String: PlateRenderer] = [:]
    private var tags: [String: PlateTags] = [:]
    private var tagMarks: [String: [PlateTagAnnotation]] = [:]
    private var finals: [String: FinalSegmentPolyline] = [:]
    private var task: Task<Void, Never>?
    /// Each page's card for VoiceOver, which cannot tap a page: one of the
    /// map's actions per plate (Apple's HIG: every gesture has an
    /// accessible way to do the same).
    private var actions: [UIAccessibilityCustomAction] = []

    /// The final approach segment's colour: the pattern's teal, the
    /// nearest design/tokens.json has to ForeFlight's cyan until a token of
    /// its own is added there (asked in the branch's report).
    static var finalColour: UIColor { WingtipColor.Chart.pattern }

    override nonisolated init() { super.init() }

    /// The approaches whose plates are drawn: with the Map card's Approach
    /// Plates on, every approach on the route but those hidden from their
    /// card.
    static func shown(plates: Bool, approaches: [ProcedurePick], hidden: Set<String>) -> [ProcedurePick] {
        guard plates else { return [] }
        return approaches.filter { $0.kind == "approach" && !hidden.contains(PlateKey.of($0)) }
    }

    func attach(to map: MKMapView) {
        map.register(PlateTagView.self, forAnnotationViewWithReuseIdentifier: PlateTagView.reuse)
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        map.addGestureRecognizer(tap)
    }

    /// Along with MapKit's own taps and the course's.
    nonisolated func gestureRecognizer(_ a: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith b: UIGestureRecognizer) -> Bool { true }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        guard let map = tap.view as? MKMapView, let onPlate, !pages.isEmpty else { return }
        let at = tap.location(in: map)
        // A mark's tap is the mark's, the course's the leg's.
        if map.hitTest(at, with: nil).map({ $0 is MKAnnotationView || $0.superview is MKAnnotationView }) == true { return }
        if tapIsCourse?(at, map) == true { return }
        if let key = plate(at: MKMapPoint(map.convert(at, toCoordinateFrom: map))) { onPlate(key) }
    }

    /// The plate whose page is under a point, the last drawn on top.
    func plate(at point: MKMapPoint) -> String? {
        keys.last { pages[$0]?.placement.contains(point) == true }
    }

    func update(_ map: MKMapView, picks: [ProcedurePick], look next: PlateLook, tiles: (any MKOverlay)?) {
        if next != look {
            let tagsChanged = next.annotations != look.annotations
            look = next
            for renderer in renderers.values { renderer.show(next) }
            if tagsChanged { for key in keys { showTags(key, on: map) } }
        }
        let wanted = picks.map(PlateKey.of)
        guard wanted != keys else { return }
        keys = wanted
        refresh(map, picks: picks, tiles: tiles)
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        if let page = overlay as? PlateMapOverlay {
            let renderer = PlateRenderer(overlay: page, look: look)
            renderers[page.key] = renderer
            return renderer
        }
        if let final = overlay as? FinalSegmentPolyline {
            let renderer = MKPolylineRenderer(polyline: final)
            renderer.strokeColor = Self.finalColour
            renderer.lineWidth = 8
            renderer.lineCap = .round
            return renderer
        }
        return nil
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        guard let mark = annotation as? PlateTagAnnotation else { return nil }
        return map.dequeueReusableAnnotationView(withIdentifier: PlateTagView.reuse, for: mark)
    }

    private func refresh(_ map: MKMapView, picks: [ProcedurePick], tiles: (any MKOverlay)?) {
        task?.cancel()
        for key in Array(pages.keys) where !keys.contains(key) { remove(key, from: map) }
        let missing = picks.filter { pages[PlateKey.of($0)] == nil }
        guard !missing.isEmpty else { return }
        task = Task { @MainActor [weak self, weak map] in
            for pick in missing {
                let key = PlateKey.of(pick)
                // A plate without a georeference draws nothing: the coded
                // lines alone.
                guard let plate = try? await Planner.plate(pick.ident, procedure: pick.id),
                      let placement = PlatePlacement(plate),
                      let image = try? await PictureCache.image(PlatePlacement.picturePath(plate, ident: pick.ident, procedure: pick.id)),
                      !Task.isCancelled, let self, let map, self.keys.contains(key), self.pages[key] == nil else { continue }
                let page = PlateMapOverlay(key: key, name: plate.name, placement: placement, image: image)
                pages[key] = page
                speak(on: map)
                // Over the chart, under the route and the procedure's lines.
                if let tiles, map.overlays.contains(where: { $0 === tiles }) {
                    map.insertOverlay(page, above: tiles)
                } else {
                    map.addOverlay(page, level: .aboveRoads)
                }
                if let found = await PlateTags.fetch(pick), !Task.isCancelled, self.pages[key] != nil {
                    tags[key] = found
                    showTags(key, on: map)
                }
            }
        }
    }

    /// A plate's tags and final segment on the map while Show Annotations
    /// is on, off it while it is off.
    private func showTags(_ key: String, on map: MKMapView) {
        if let marks = tagMarks.removeValue(forKey: key) { map.removeAnnotations(marks) }
        if let final = finals.removeValue(forKey: key) { map.removeOverlay(final) }
        guard look.annotations, let found = tags[key], pages[key] != nil else { return }
        var line = found.finalSegment
        if line.count >= 2 {
            let final = FinalSegmentPolyline(coordinates: &line, count: line.count)
            // Over the page, under the course.
            if let page = pages[key] { map.insertOverlay(final, above: page) } else { map.addOverlay(final, level: .aboveLabels) }
            finals[key] = final
        }
        let marks = found.fixes.map { PlateTagAnnotation($0, plate: key) }
        tagMarks[key] = marks
        map.addAnnotations(marks)
    }

    private func remove(_ key: String, from map: MKMapView) {
        if let page = pages.removeValue(forKey: key) { map.removeOverlay(page) }
        speak(on: map)
        renderers[key] = nil
        tags[key] = nil
        showTags(key, on: map)
    }

    private func speak(on map: MKMapView) {
        let others = (map.accessibilityCustomActions ?? []).filter { action in !actions.contains { $0 === action } }
        actions = keys.compactMap { key in
            guard let page = pages[key], let parts = PlateKey.parts(key) else { return nil }
            return UIAccessibilityCustomAction(name: "\(PlateKey.title(ident: parts.ident, name: page.name)) Plate") { [weak self] _ in
                self?.onPlate?(key)
                return self?.onPlate != nil
            }
        }
        map.accessibilityCustomActions = others + actions
    }
}

extension ChartMap.Coordinator {
    /// The course's taps (RouteLegLayer), and the plates told of them: a
    /// tap on the course opens its leg, not the plate under it.
    @MainActor
    func attachLegs(_ map: MKMapView) {
        legLayer.attach(map)
        let legs = legLayer
        extras.plates.tapIsCourse = { [weak legs] at, map in legs?.hits(at, on: map) == true }
    }
}
