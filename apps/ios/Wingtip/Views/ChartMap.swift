@preconcurrency import MapKit
import SwiftUI

/// The map: the FAA chart as its ground over Apple's map, own ship on it,
/// the fields in view in the sectional's symbols, the airspace, VORs and
/// runways (ChartOverlays), and the route's course line, shown as one
/// thing once they are in (the reveal).
/// MKMapView rather than SwiftUI's Map, for the tile overlay and the
/// renderers the route and the marks need.
struct ChartMap: UIViewRepresentable {
    let template: TileTemplate?
    let minZoom: Int
    let maxZoom: Int
    /// The course line, fitted into view when it changes.
    let course: Course?
    /// The route's checkpoints, numbered along it.
    let checkpoints: [Checkpoint]
    /// The procedures' paths the legs fly, drawn with the course.
    let procedurePaths: [[CLLocationCoordinate2D]]
    /// A dry run's airplane, where it is and which way it points.
    let simulated: OwnShip.Fix?
    /// The airplanes heard about, and own ship's height to set theirs
    /// against.
    var traffic: [TrafficAircraft] = []
    var ownFt: Double?
    /// Where the map rested: its middle and the miles to its corner.
    var onRegion: ((CLLocationCoordinate2D, Double) -> Void)?
    /// A field's mark tapped.
    var onAirport: ((String) -> Void)?
    /// Own ship kept in the middle; a pan by the pilot ends it.
    @Binding var following: Bool
    /// Whether the route is out of the view, for the arrow's other face.
    @Binding var routeAway: Bool
    /// Counted up to fit the whole route again.
    var fitRequest: Int = 0
    /// The airplane tracked, the flights flown, and the long press for a
    /// point of the route (FlightMapLayer).
    var flight = FlightLayer()
    /// A held finger's pin, the waypoints, the Class B fields and the
    /// plates (MapExtras.swift).
    var extras = MapExtrasInput()
    /// The route's legs, the one open and the tap that opens one
    /// (RouteLegLayer).
    var routeLegs = RouteLegInput()
    /// Dark appearance and Setup's Chart at night, for the chart's dimming
    /// and the course's night magenta (NightPalette).
    @Environment(\.colorScheme) var colorScheme
    @AppStorage(ChartNight.key) var chartNight = ChartNight.dimmed.rawValue
    /// Setup's Military fields and Private fields.
    @AppStorage(MapExtrasInput.Keys.military) var militaryFields = false
    @AppStorage(MapExtrasInput.Keys.privateFields) var privateFields = false
    /// The Map card's Terrain: flat, or MapKit's 3D (RaisedMapView).
    @AppStorage(MapTerrain.key) var terrain = MapTerrain.flat.rawValue
    /// Settings' Airport Weather, and the plan's part of the marks: the ↓
    /// fields and the airplane's crosswind (FieldWeatherState).
    var airportWeather = AirportWeatherSetting()
    var fieldWeather = FieldWeatherInput()
    /// The legs a hazard tapped in the Brief is on (HazardLegsViews.swift).
    var hazardLegs: HazardLegs?
    /// The height the sheet covers at the foot of the map now: the map
    /// opens with the pilot's position in the middle of what it leaves,
    /// under the loading mark (MapOpening).
    var bottomInset: CGFloat = 0
    /// Told once, when the chart and its overlays are in (or after 2.5 s
    /// at most): the loading mark then fades and the map shows as one
    /// thing, as the web map's reveal.
    var onReveal: (() -> Void)?

    /// The longest the map waits for its chart and overlays before it shows
    /// what it has, the web map's cap.
    static let revealCap: Duration = .milliseconds(2500)

    func makeUIView(context: Context) -> MKMapView {
        // Apple's muted map under the chart, flat, or its 3D ground (RaisedMapView, the Terrain).
        let map = RaisedMapView()
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.showsCompass = true
        map.showsScale = true
        map.pointOfInterestFilter = .excludingAll
        map.register(AirportMarkView.self, forAnnotationViewWithReuseIdentifier: AirportMarkView.reuse)
        map.register(CheckpointMarkView.self, forAnnotationViewWithReuseIdentifier: CheckpointMarkView.reuse)
        map.register(TrafficMarkView.self, forAnnotationViewWithReuseIdentifier: TrafficMarkView.reuse)
        context.coordinator.extras.attach(to: map)
        context.coordinator.overlays.attach(to: map)
        // Where the map opens is set once it has its size and the sheet's
        // (Coordinator.open); the map shows at the cap at the latest.
        let coordinator = context.coordinator
        coordinator.onReveal = onReveal
        coordinator.overlays.onFirstAnswer = { [weak coordinator] in coordinator?.airspaceAnswered() }
        Task { @MainActor in
            try? await Task.sleep(for: Self.revealCap)
            coordinator.reveal()
        }
        let flight = FlightMapLayer()
        flight.attach(map)
        context.coordinator.flight = flight
        context.coordinator.attachLegs(map)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.onAirport = onAirport
        context.coordinator.onReveal = onReveal
        let shade = (ChartNight(rawValue: chartNight) ?? .dimmed).shade(dark: colorScheme == .dark)
        context.coordinator.dim(shade)
        context.coordinator.open(map, bottomInset: bottomInset)
        context.coordinator.onRegion = onRegion
        context.coordinator.useFields(extras.fieldSwitches(military: militaryFields, privateFields: privateFields), on: map)
        context.coordinator.weather.update(map, choice: airportWeather.choice, input: fieldWeather, zoom: Coordinator.zoom(of: map))
        context.coordinator.show(traffic, ownFt: ownFt, on: map)
        context.coordinator.flight?.update(map, flight)
        context.coordinator.extras.update(map, extras, tiles: context.coordinator.overlay)
        context.coordinator.setFollowing = { [self] on in following = on }
        context.coordinator.setRouteAway = { [self] away in if routeAway != away { routeAway = away } }
        // Every move of the map here steps to its end with Reduce Motion
        // on (MapMotion), as Maps' own do.
        if following, map.userTrackingMode != .follow {
            map.setUserTrackingMode(.follow, animated: MapMotion.animated)
        } else if !following, map.userTrackingMode != .none {
            map.setUserTrackingMode(.none, animated: false)
        }
        if context.coordinator.fitted != fitRequest, let line = context.coordinator.courseLine {
            context.coordinator.fitted = fitRequest
            map.setVisibleMapRect(line.boundingMapRect, edgePadding: Self.routePadding(in: map), animated: MapMotion.animated)
        }
        // The day's lift on the chart (ChartLift), none on the dimmed one at
        // night: a change of either draws the chart again from the store.
        let lift = shade == 0
        if let template, context.coordinator.overlay?.template != template || context.coordinator.overlay?.lift != lift {
            if let current = context.coordinator.overlay {
                context.coordinator.tilesStopped()
                map.removeOverlay(current)
            }
            let overlay = ChartTileOverlay(template: template, minZoom: minZoom, maxZoom: maxZoom, lift: lift)
            let coordinator = context.coordinator
            overlay.onTile = { coordinator.chartTile() }
            // Under everything else drawn over Apple's map but the imagery under it close in.
            map.insertOverlay(overlay, at: 0, level: .aboveLabels)
            CloseImagery.shared.place(on: map, under: overlay)
            context.coordinator.overlay = overlay
        }
        if context.coordinator.checkpointsShown != checkpoints {
            context.coordinator.checkpointsShown = checkpoints
            context.coordinator.showCheckpoints(checkpoints, on: map)
        }
        if !context.coordinator.proceduresShown.elementsEqual(procedurePaths, by: Self.samePath) {
            // Each path kept as it is while its points are the same; a new
            // or changed one drawn, a gone one taken off: every change to
            // the plan redrew every procedure line before.
            context.coordinator.proceduresShown = procedurePaths
            let wanted = procedurePaths.filter { $0.count >= 2 }
            var kept: [(path: [CLLocationCoordinate2D], line: ProcedurePolyline)] = []
            var unused = context.coordinator.procedureLines
            for path in wanted {
                if let i = unused.firstIndex(where: { Self.samePath($0.path, path) }) {
                    kept.append(unused.remove(at: i))
                } else {
                    let line = ProcedurePolyline(coordinates: path, count: path.count)
                    map.addOverlay(line, level: .aboveLabels)
                    kept.append((path: path, line: line))
                }
            }
            map.removeOverlays(unused.map(\.line))
            context.coordinator.procedureLines = kept
        }
        if let simulated {
            let plane = context.coordinator.plane ?? {
                let mark = PlaneAnnotation(); context.coordinator.plane = mark; map.addAnnotation(mark); return mark
            }()
            plane.coordinate = simulated.coordinate
            plane.heading = simulated.trackDeg ?? 0
            (map.view(for: plane) as? PlaneMarkView)?.turn(to: plane.heading)
            // Kept in sight as it moves: brought back to the middle of the
            // map clear of the sheet where it would leave it, as the web
            // app's replay keeps its airplane (useReplayMarker).
            if context.coordinator.simulatedAt != simulated.at {
                context.coordinator.simulatedAt = simulated.at
                Self.keepInSight(simulated.coordinate, on: map)
            }
        } else if let plane = context.coordinator.plane {
            map.removeAnnotation(plane)
            context.coordinator.plane = nil
            context.coordinator.simulatedAt = nil
        }
        context.coordinator.showHazardLegs(hazardLegs, on: map)
        let routeIdents = Set(([course?.departure, course?.destination].compactMap { $0 } + (course?.stops ?? [])).map(\.ident))
        if context.coordinator.routeIdents != routeIdents {
            context.coordinator.routeIdents = routeIdents
            context.coordinator.refreshFields(on: map)
        }
        if context.coordinator.courseShown != course {
            context.coordinator.courseShown = course
            if let line = context.coordinator.courseLine { map.removeOverlay(line) }
            if let edge = context.coordinator.courseEdge { map.removeOverlay(edge) }
            context.coordinator.courseEdge = nil
            context.coordinator.courseLine = nil
            if let course, course.coordinates.count >= 2 {
                let edge = CourseEdgePolyline(coordinates: course.coordinates, count: course.coordinates.count)
                map.addOverlay(edge, level: .aboveLabels)
                context.coordinator.courseEdge = edge
                let line = MKPolyline(coordinates: course.coordinates, count: course.coordinates.count)
                map.addOverlay(line, level: .aboveLabels)
                context.coordinator.courseLine = line
                // The whole route in sight above the sheet, which covers
                // the lower half: as the web app fits a route clear of it.
                map.setVisibleMapRect(line.boundingMapRect, edgePadding: Self.routePadding(in: map), animated: MapMotion.animated)
            }
        }
        context.coordinator.legLayer.update(map, routeLegs, night: shade > 0, below: context.coordinator.courseEdge)
        (map as? RaisedMapView)?.use(MapTerrain(rawValue: terrain) ?? .flat, field: course?.destination.ident)
    }

    /// Whether two paths are the same points, to the metre: a procedure's
    /// line is left on the map while its path has not changed.
    nonisolated static func samePath(_ a: [CLLocationCoordinate2D], _ b: [CLLocationCoordinate2D]) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy { abs($0.latitude - $1.latitude) < 1e-5 && abs($0.longitude - $1.longitude) < 1e-5 }
    }

    static func routePadding(in map: MKMapView) -> UIEdgeInsets {
        // On the iPad and iPhone Duo open the sidebar and the inspector
        // are beside the map (their safe areas), the figures along its
        // foot; on the iPhone the sheet covers the lower half. The sides
        // keep their own insets: iPhone Duo's differ left and right.
        let safe = map.safeAreaInsets
        let trait = map.traitCollection
        if RootLayout.of(UserInterfaceSizeClass(trait.horizontalSizeClass), UserInterfaceSizeClass(trait.verticalSizeClass)) == .split {
            return UIEdgeInsets(top: safe.top + 80, left: safe.left + 40, bottom: safe.bottom + 120, right: safe.right + 40)
        }
        return UIEdgeInsets(top: 80, left: safe.left + 40, bottom: map.bounds.height * 0.5 + 40, right: safe.right + 40)
    }

    /// A moving airplane's point brought back into the part of the map in
    /// sight, the route's padding in from its edges, once it leaves it.
    static func keepInSight(_ at: CLLocationCoordinate2D, on map: MKMapView) {
        guard map.bounds.width > 0 else { return }
        let clear = map.bounds.inset(by: routePadding(in: map))
        let point = map.convert(at, toPointTo: map)
        guard clear.width > 0, clear.height > 0, !clear.contains(point) else { return }
        let middle = CGPoint(x: map.bounds.midX + point.x - clear.midX, y: map.bounds.midY + point.y - clear.midY)
        // A step, not a glide, with Reduce Motion on: the replay's and the
        // dry run's airplane then jumps back into sight.
        map.setCenter(map.convert(middle, toCoordinateFrom: map), animated: MapMotion.animated)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var overlay: ChartTileOverlay?
        var courseLine: MKPolyline?
        var courseEdge: CourseEdgePolyline?
        var courseShown: Course?
        var hazardLines: [HazardPolyline] = []
        var hazardShown: HazardLegs?
        var checkpointsShown: [Checkpoint] = []
        var proceduresShown: [[CLLocationCoordinate2D]] = []
        var plane: PlaneAnnotation?
        var simulatedAt: Date?
        /// Each procedure's line with the path it was drawn from, kept
        /// while the path is the same (updateUIView).
        var procedureLines: [(path: [CLLocationCoordinate2D], line: ProcedurePolyline)] = []
        /// The checkpoints' marks by the checkpoint's id, with the number
        /// and place each was drawn with.
        private var checkpointMarks: [String: (number: Int, checkpoint: Checkpoint, mark: CheckpointAnnotation)] = [:]
        /// The route's fields (its ends and stops): drawn whatever the
        /// zoom, never dropped for another (AirportAnnotation.priority).
        var routeIdents: Set<String> = []
        /// Whether the checkpoints' names show at the zoom now.
        var checkpointNames = false
        var onAirport: ((String) -> Void)?

        /// The checkpoints' marks brought to `checkpoints`: a new one
        /// added, a gone one taken off, one whose number, name, place or
        /// score changed drawn again, the rest left as they are -- every
        /// change to the plan took every mark off the map and put it back
        /// before, a flicker of the whole route.
        @MainActor
        func showCheckpoints(_ checkpoints: [Checkpoint], on map: MKMapView) {
            var wanted: [String: (number: Int, checkpoint: Checkpoint)] = [:]
            for (i, checkpoint) in checkpoints.enumerated() { wanted[checkpoint.id] = (number: i + 1, checkpoint: checkpoint) }
            for (id, drawn) in checkpointMarks where wanted[id] == nil || wanted[id]!.number != drawn.number || wanted[id]!.checkpoint != drawn.checkpoint {
                map.removeAnnotation(drawn.mark)
                checkpointMarks[id] = nil
            }
            for (id, want) in wanted where checkpointMarks[id] == nil {
                let mark = CheckpointAnnotation(number: want.number, checkpoint: want.checkpoint)
                map.addAnnotation(mark)
                checkpointMarks[id] = (number: want.number, checkpoint: want.checkpoint, mark: mark)
            }
        }
        var onRegion: ((CLLocationCoordinate2D, Double) -> Void)?
        private var trafficShown: [String: TrafficAnnotation] = [:]
        private var trafficDrawn: (planes: [TrafficAircraft], ownFt: Double?)?
        var setFollowing: ((Bool) -> Void)?
        var setRouteAway: ((Bool) -> Void)?
        var fitted = 0
        var flight: FlightMapLayer?
        let legLayer = RouteLegLayer()
        private var followed = false
        private var fetching: Task<Void, Never>?
        private var shown: [String: AirportAnnotation] = [:]
        let extras = MapExtrasState()
        /// The fields' weather on their marks (FieldWeatherState).
        let weather = FieldWeatherState()
        /// The chart's renderer and the course's, kept to restyle when
        /// the appearance or the setting changes; MapKit asks for a
        /// renderer once per overlay.
        private var tiles: ChartTileRenderer?
        private var courseRenderer: MKPolylineRenderer?
        private var edgeRenderer: MKPolylineRenderer?
        private var shade: CGFloat = 0

        /// The chart's renderer let go, its loads stopped, as its overlay
        /// is taken off for another.
        func tilesStopped() {
            tiles?.stop()
            tiles = nil
        }

        func dim(_ shade: CGFloat) {
            guard shade != self.shade else { return }
            self.shade = shade
            tiles?.shade = shade
            courseRenderer?.strokeColor = NightPalette.course
            edgeRenderer?.strokeColor = NightPalette.routeEdge(night: shade > 0)
            edgeRenderer?.setNeedsDisplay()
            courseRenderer?.setNeedsDisplay()
        }

        /// The course's two strokes, points, as the web draws them where a
        /// pilot reads a leg (glStyle's widths at zoom 10): the magenta core
        /// and the thin edge round it.
        static let courseWidth: CGFloat = 4.5, edgeWidth: CGFloat = 6.5

        func mapView(_ mapView: MKMapView, rendererFor overlay: any MKOverlay) -> MKOverlayRenderer {
            if let renderer = flight?.renderer(for: overlay) { return renderer }
            if let renderer = MainActor.assumeIsolated({ legLayer.renderer(for: overlay) }) { return renderer }
            if let renderer = MainActor.assumeIsolated({ overlays.renderer(for: overlay) }) { return renderer }
            if let chart = overlay as? ChartTileOverlay {
                let renderer = ChartTileRenderer(chart: chart)
                renderer.shade = shade
                renderer.alpha = ChartFade.alpha(zoom: Self.zoom(of: mapView), last: chart.maxZoom)
                tiles = renderer
                return renderer
            }
            if let imagery = overlay as? CloseImageryOverlay { return MainActor.assumeIsolated { CloseImagery.shared.renderer(imagery, zoom: Self.zoom(of: mapView)) } }
            if let tiles = overlay as? MKTileOverlay { return MKTileOverlayRenderer(tileOverlay: tiles) }
            if let renderer = MainActor.assumeIsolated({ extras.plates.renderer(for: overlay) }) { return renderer }
            if let edge = overlay as? CourseEdgePolyline {
                let renderer = MKPolylineRenderer(polyline: edge)
                renderer.strokeColor = NightPalette.routeEdge(night: shade > 0)
                renderer.lineWidth = Self.edgeWidth
                renderer.lineJoin = .round
                renderer.lineCap = .round
                edgeRenderer = renderer
                return renderer
            }
            if let hazard = overlay as? HazardPolyline {
                // The legs a hazard tapped in the Brief is on, wide in
                // amber under the course (HazardLegsViews.swift).
                let renderer = MKPolylineRenderer(polyline: hazard)
                renderer.strokeColor = UIColor.systemOrange.withAlphaComponent(0.6)
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
                // The web app's magenta course line, the night's lighter
                // one over a dimmed chart.
                let renderer = MKPolylineRenderer(polyline: line)
                renderer.strokeColor = NightPalette.course
                courseRenderer = renderer
                renderer.lineWidth = Self.courseWidth
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }
            return MKOverlayRenderer(overlay: overlay)
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: any MKAnnotation) -> MKAnnotationView? {
            if let plane = annotation as? PlaneAnnotation {
                let view = (mapView.dequeueReusableAnnotationView(withIdentifier: PlaneMarkView.reuse) as? PlaneMarkView) ?? PlaneMarkView(annotation: plane, reuseIdentifier: PlaneMarkView.reuse)
                view.annotation = plane
                view.turn(to: plane.heading)
                return view
            }
            if let view = flight?.view(for: annotation, on: mapView) { return view }
            if let mark = annotation as? TrafficAnnotation {
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: TrafficMarkView.reuse, for: mark) as! TrafficMarkView
                view.show(mark)
                return view
            }
            if let extra = MainActor.assumeIsolated({ extras.view(for: annotation, on: mapView) }) { return extra }
            if let overlay = MainActor.assumeIsolated({ overlays.view(for: annotation, on: mapView) }) { return overlay }
            if annotation is CheckpointAnnotation {
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: CheckpointMarkView.reuse, for: annotation)
                (view as? CheckpointMarkView)?.showName(checkpointNames)
                return view
            }
            guard annotation is AirportAnnotation else { return nil }
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: AirportMarkView.reuse, for: annotation)
            (view as? AirportMarkView)?.scaleSymbol(symbolScale)
            return view
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            if flight?.selected(view, on: mapView) == true { return }
            guard let field = view.annotation as? AirportAnnotation else { return }
            mapView.deselectAnnotation(field, animated: false)
            onAirport?(field.ident)
        }

        /// The first position moves the map there once, at the web app's
        /// opening zoom, in the middle of what the sheet leaves; after that
        /// the pilot's own panning stands. Kept on the phone, so the map
        /// opens there next time (MapOpening).
        func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
            guard let at = userLocation.location else { return }
            if Date().timeIntervalSince(rememberedAt) > 30 {
                rememberedAt = Date()
                MapOpening.remember(at.coordinate)
            }
            guard !followed else { return }
            followed = true
            // Before the map shows, it is put there as it opens; after, it
            // glides there.
            put(mapView, at: at.coordinate, animated: revealed && MapMotion.animated)
        }

        // MARK: Opening and showing

        private var rememberedAt = Date.distantPast
        /// The sheet's height the map was last put in the middle of.
        private var openedInset: CGFloat?
        private var opening: CLLocationCoordinate2D?
        private(set) var revealed = false
        var onReveal: (() -> Void)?
        private var chartDrawn = false
        private var airportsIn = false
        private var airspaceIn = false
        private var quiet: Task<Void, Never>?

        /// The map put where it opens, once it has its size, and again as
        /// the sheet's height changes until the map shows: the position is
        /// under the loading mark whatever the sheet did meanwhile.
        @MainActor
        func open(_ map: MKMapView, bottomInset: CGFloat) {
            guard map.bounds.width > 0, !revealed, openedInset != bottomInset else { return }
            openedInset = bottomInset
            let at = opening ?? map.userLocation.location?.coordinate ?? MapOpening.remembered() ?? MapOpening.fallback
            put(map, at: at, animated: false)
        }

        /// A point in the middle of what the sheet leaves, at the opening zoom.
        @MainActor
        private func put(_ map: MKMapView, at: CLLocationCoordinate2D, animated: Bool) {
            guard map.bounds.width > 0 else { return }
            opening = at
            let size = map.bounds.size
            // The view's width in map points at the zoom (MapKit's world is
            // 2^28 of them, Leaflet's 256 points at zoom 0): a region fitted
            // by MapKit came out a level short of the web's 8, under the
            // Class D's and the VORs' zoom.
            let zoom = MapOpening.zoomAsked ?? MapOpening.zoom
            let wide = Double(size.width) * MKMapSize.world.width / (256 * pow(2, zoom))
            // MapKit fits a rect into the view less its safe area, so the rect
            // is that shape: the full height's would come out a tenth wider.
            let safe = map.bounds.inset(by: map.safeAreaInsets).size
            let high = wide * Double(safe.height / max(1, safe.width))
            let middlePoint = MKMapPoint(at)
            map.setVisibleMapRect(MKMapRect(x: middlePoint.x - wide / 2, y: middlePoint.y - high / 2, width: wide, height: high), animated: false)
            let drop = MapOpening.drop(height: size.height, top: map.safeAreaInsets.top, bottomInset: openedInset ?? 0)
            let middle = map.convert(CGPoint(x: size.width / 2, y: size.height / 2 + drop), toCoordinateFrom: map)
            map.setCenter(middle, animated: animated)
        }

        /// A tile of the chart answered: once they stop coming for a moment
        /// the chart is drawn.
        @MainActor
        func chartTile() {
            guard !revealed else { return }
            quiet?.cancel()
            quiet = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled, let self else { return }
                self.chartDrawn = true
                self.revealIfIn()
            }
        }

        /// The airspace answered for the first time (ChartOverlays).
        @MainActor
        func airspaceAnswered() {
            airspaceIn = true
            revealIfIn()
        }

        /// The fields drawn, as Setup's settings leave them, for their runways.
        @MainActor
        var shownPins: [AirportPin] {
            AirportPin.shown(pins, military: fieldUse.military, privateFields: fieldUse.privateFields)
        }

        @MainActor
        private func revealIfIn() {
            if chartDrawn, airportsIn, airspaceIn { reveal() }
        }

        /// The map shown, once: the loading mark fades over it.
        @MainActor
        func reveal() {
            guard !revealed else { return }
            revealed = true
            onReveal?()
        }

        /// The web map's zoom of the view (Leaflet's levels).
        static func zoom(of map: MKMapView) -> Double {
            MapExtras.zoom(longitudeDelta: map.region.span.longitudeDelta, width: Double(map.bounds.width))
        }

        // MARK: During a gesture

        let overlays = ChartOverlays()
        private var liveAirports = ViewFetch()
        private(set) var symbolScale: CGFloat = 1

        /// The view moving, frame by frame: the chart's fade and the marks'
        /// size follow the pinch, and the overlays are asked again from the
        /// packs where the view changes level or leaves what was asked, as
        /// the web map's do (useGlView), not only once the fingers lift.
        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            MainActor.assumeIsolated {
                let zoom = Self.zoom(of: mapView)
                CloseImagery.shared.fade(chart: tiles, last: overlay?.maxZoom, zoom: zoom)
                // The chart's loads of tiles gone out of view stopped.
                if mapView.visibleMapRect.width > 0 {
                    tiles?.keep(visible: mapView.visibleMapRect, zoomScale: MKZoomScale(Double(mapView.bounds.width) / mapView.visibleMapRect.width))
                }
                // The checkpoints' names in with the zoom (CheckpointAnnotation).
                let names = zoom >= CheckpointAnnotation.namesFromZoom
                if names != checkpointNames {
                    checkpointNames = names
                    for case let mark as CheckpointAnnotation in mapView.annotations {
                        (mapView.view(for: mark) as? CheckpointMarkView)?.showName(names)
                    }
                }
                let scale = SectionalSymbol.scale(zoom: zoom)
                if abs(scale - symbolScale) > 0.02 {
                    symbolScale = scale
                    for case let field as AirportAnnotation in mapView.annotations {
                        (mapView.view(for: field) as? AirportMarkView)?.scaleSymbol(scale)
                    }
                }
                overlays.moved(mapView, chart: overlay, live: true)
                weather.moved(mapView, zoom: zoom)
                let view = ViewBox(mapView.region)
                guard liveAirports.wants(view, zoom: zoom) else { return }
                let asked = liveAirports.ask(view, zoom: zoom)
                // Off the main actor (CyclePacks.airportsInView), taken back
                // only while the view still wants this box.
                Task { @MainActor [weak self, weak mapView] in
                    let pins = await CyclePacks.shared.airportsInView(asked)
                    guard let self, let mapView, liveAirports.box == asked else { return }
                    guard let pins else { return liveAirports.forget() }
                    self.pins = pins
                    showFields(on: mapView)
                }
            }
        }

        /// The fields in view, asked for once the map has rested a third
        /// of a second, as the web app asks (/api/airports/in-view): the
        /// planner picks fewer and bigger ones as the view widens.
        /// The pilot's own pan ends the following, as Maps' does.
        func mapView(_ mapView: MKMapView, didChange mode: MKUserTrackingMode, animated: Bool) {
            setFollowing?(mode == .follow)
        }

        func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
            flight?.regionWillChange(mapView)
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            if let line = courseLine {
                // Off the route once less than a third of its box is in
                // the view above the sheet.
                let seen = mapView.visibleMapRect.intersection(line.boundingMapRect)
                let share = line.boundingMapRect.size.width * line.boundingMapRect.size.height
                setRouteAway?(share > 0 && (seen.size.width * seen.size.height) / share < 0.34)
            } else {
                setRouteAway?(false)
            }
            MainActor.assumeIsolated {
                extras.regionChanged(mapView)
                overlays.moved(mapView, chart: overlay, live: false)
                overlays.runways(mapView, fields: shownPins, chart: overlay)
                weather.rested(mapView)
            }
            fetching?.cancel()
            let region = mapView.region
            let (c, span) = (region.center, region.span) // The miles to the corner the engine's (distance_nm), else the last view's kept: a real one, not a guess.
            if let nm = try? Flight.distanceNm(c, CLLocationCoordinate2D(latitude: c.latitude + span.latitudeDelta / 2, longitude: c.longitude + span.longitudeDelta / 2)) { onRegion?(c, nm) }
            fetching = Task { [weak self, weak mapView] in
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled, let self, let mapView else { return }
                let south = region.center.latitude - region.span.latitudeDelta / 2
                let north = region.center.latitude + region.span.latitudeDelta / 2
                let west = region.center.longitude - region.span.longitudeDelta / 2
                let east = region.center.longitude + region.span.longitudeDelta / 2
                // From the phone's own packs where the engine has them,
                // the planner otherwise (PackMapData).
                let pins = try? await PackMapData.airports(south: south, west: west, north: north, east: east)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    // In, or not to be had: either way the map need not
                    // wait for them to show.
                    self.airportsIn = true
                    self.revealIfIn()
                    guard let pins else { return }
                    self.pins = pins
                    self.showFields(on: mapView)
                    self.overlays.runways(mapView, fields: self.shownPins, chart: self.overlay)
                }
            }
        }

        /// The airplanes moved to their new reports, the ones no longer
        /// heard taken off, the new ones added.
        @MainActor
        func show(_ planes: [TrafficAircraft], ownFt: Double?, on map: MKMapView) {
            // The map's update runs at every fix; the traffic and own ship's
            // height as last drawn need no engine call (traffic_marks) again.
            guard trafficDrawn?.planes != planes || trafficDrawn?.ownFt != ownFt else { return }
            trafficDrawn = (planes, ownFt)
            let fresh = Dictionary(planes.map { ($0.hex, $0) }, uniquingKeysWith: { a, _ in a })
            let gone = trafficShown.filter { fresh[$0.key] == nil }
            map.removeAnnotations(Array(gone.values))
            for hex in gone.keys { trafficShown[hex] = nil }
            // Every airplane's mark in one call of the engine (traffic_marks
            // takes the whole list), handed to each annotation: each view
            // asked for its one airplane, a screen of traffic a screen of
            // calls at every report (Session2's profile, 2026-11-03).
            let ordered = Array(fresh.values)
            // Where the engine refuses, the airplanes are drawn with no
            // tag; Traffic's own check of the same report shows why
            // (marksProblem, beside the credit).
            let drawn = (try? Traffic.marks(ordered, ownFt: ownFt)) ?? []
            for (i, plane) in ordered.enumerated() {
                let its = i < drawn.count ? drawn[i] : nil
                if let mark = trafficShown[plane.hex] {
                    guard mark.plane != plane || mark.ownFt != ownFt || mark.drawn != its else { continue }
                    mark.plane = plane
                    mark.ownFt = ownFt
                    mark.drawn = its
                    mark.coordinate = CLLocationCoordinate2D(latitude: plane.lat, longitude: plane.lon)
                    (map.view(for: mark) as? TrafficMarkView)?.show(mark)
                } else {
                    let mark = TrafficAnnotation(plane, ownFt: ownFt, drawn: its)
                    trafficShown[plane.hex] = mark
                    map.addAnnotation(mark)
                }
            }
        }

        @MainActor
        /// The fields in the view as the planner gave them, and which of
        /// them Setup draws.
        private var pins: [AirportPin] = []
        private var fieldUse = (military: false, privateFields: false)

        /// Setup's settings put to the marks already drawn, at once.
        @MainActor
        func useFields(_ use: (military: Bool, privateFields: Bool), on map: MKMapView) {
            guard fieldUse.military != use.military || fieldUse.privateFields != use.privateFields else { return }
            fieldUse = use
            showFields(on: map)
        }

        @MainActor
        private func showFields(on map: MKMapView) {
            let kept = AirportPin.shown(pins, military: fieldUse.military, privateFields: fieldUse.privateFields)
            show(kept.map { pin in
                let field = AirportAnnotation(pin, onRoute: routeIdents.contains(pin.ident))
                field.weather = weather.mark(pin.ident)
                return field
            }, on: map)
        }

        /// The marks drawn again as the route changes, for which stand on
        /// their own and which may give way (AirportAnnotation.onRoute).
        @MainActor
        func refreshFields(on map: MKMapView) {
            guard !pins.isEmpty else { return }
            showFields(on: map)
        }

        /// The marks changed, not every mark drawn again: the ones gone out of view removed, the new ones added, the rest left be.
        private func show(_ fields: [AirportAnnotation], on map: MKMapView) {
            let fresh = Dictionary(fields.map { ($0.ident, $0) }, uniquingKeysWith: { a, _ in a })
            let gone = shown.filter { fresh[$0.key] == nil }.map(\.value)
            let new = fresh.filter { shown[$0.key] == nil }.map(\.value)
            map.removeAnnotations(gone)
            map.addAnnotations(new)
            for mark in gone { shown[mark.ident] = nil }
            for mark in new { shown[mark.ident] = mark }
            // A mark kept whose standing changed (a field now on the
            // route, or no longer): its view told again, which sets its
            // priority afresh.
            for (ident, mark) in shown where new.contains(where: { $0.ident == ident }) == false {
                if let want = fresh[ident], want.onRoute != mark.onRoute {
                    mark.onRoute = want.onRoute
                    (map.view(for: mark) as? AirportMarkView)?.annotation = mark
                }
            }
        }
    }
}
