@preconcurrency import MapKit
import SwiftUI

/// The Map card's Terrain, the web's Map menu's (Flat | Shaded | 3D) as
/// MapKit can draw it: flat as the chart is printed, or 3D, Apple's own
/// ground stood up and the map free to tilt. The web's Shaded, the relief
/// shaded over the chart from the planner's terrain tiles, has no MapKit
/// counterpart (MapKit draws no hillshade of an app's own elevation), so
/// it is not offered here rather than drawn by hand.
enum MapTerrain: String, CaseIterable, Identifiable, Sendable {
    case flat, raised = "3d"

    static let key = "mapTerrain"
    var id: String { rawValue }
    var label: String { self == .flat ? "Flat" : "3D" }
}

/// The Terrain pick in the Map card, segmented as the web's is.
struct TerrainPicker: View {
    @AppStorage(MapTerrain.key) private var terrain = MapTerrain.flat.rawValue

    var body: some View {
        LabeledContent("Terrain") {
            Picker("Terrain", selection: $terrain) {
                ForEach(MapTerrain.allCases) { Text($0.label).tag($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .fixedSize()
        }
    }
}

/// The app's MKMapView, which knows the Terrain. Flat, it is the map as it
/// was: Apple's muted map under the FAA chart, no tilt. In 3D it is
/// MapKit's own 3D, as Apple documents it (WWDC22 "What's new in MapKit"):
///
/// - The ground: the hybrid configuration at the realistic elevation
///   style, Apple's imagery with its terrain and labels. The standard
///   map's realistic style stands up only where Apple has its 3D City
///   Experience and is flat elsewhere, so the imagery is the one 3D
///   ground a pilot gets over the country.
/// - The FAA chart and the USGS imagery are taken off. They are tile
///   overlays drawn flat in map points, and "when adding an overlay to a
///   map with realistic terrain, MapKit will automatically transition the
///   map to a flat representation" (WWDC22), so with them the map could
///   not stand up at all. Apple's own imagery is then the map, its data on
///   its own map (CloseImagery's note on Apple's terms).
/// - Every other overlay (the route, the airspace and its tabs, the
///   weather) is put at the above-roads level, which "will be shown on top
///   of the terrain" and under the labels (WWDC22), the only level at
///   which MapKit can lay an overlay on its 3D ground; above the labels
///   it can only draw over a flat map. Lines stay on the ground: an
///   MKPolyline has no altitude.
///
/// Each overlay added while in 3D is put there too, and each goes back to
/// the level it was asked for when the map is flat again.
final class RaisedMapView: MKMapView {
    private(set) var terrain: MapTerrain = .flat
    /// The chart and the imagery under it, held off the map in 3D, bottom first.
    private var held: [any MKOverlay] = []
    /// The overlays put above the roads in 3D that were asked above the labels.
    private var lowered: Set<ObjectIdentifier> = []
    /// The route's destination's way in, drawn in 3D (ApproachLines).
    private let approach = ApproachLines()
    /// The tilt 3D opens at, for the ground to read as ground at once (the web's OPEN_PITCH).
    static let openPitch: CGFloat = 50

    override init(frame: CGRect) {
        super.init(frame: frame)
        isPitchEnabled = false
        preferredConfiguration = Self.flatLook
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Apple's map under the chart and the USGS imagery (CloseImagery),
    /// shown close in only where the USGS has none: muted, with no points
    /// of interest or traffic.
    static var flatLook: MKMapConfiguration {
        let config = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
        config.pointOfInterestFilter = .excludingAll
        config.showsTraffic = false
        return config
    }

    /// Apple's imagery with its terrain stood up, its labels kept.
    static var raisedLook: MKMapConfiguration {
        let config = MKHybridMapConfiguration(elevationStyle: .realistic)
        config.pointOfInterestFilter = .excludingAll
        config.showsTraffic = false
        return config
    }

    private static func isGround(_ overlay: any MKOverlay) -> Bool {
        overlay is ChartTileOverlay || overlay is CloseImageryOverlay
    }

    private func level(for overlay: any MKOverlay, asked: MKOverlayLevel) -> MKOverlayLevel {
        guard terrain == .raised, asked == .aboveLabels else { return asked }
        lowered.insert(ObjectIdentifier(overlay))
        return .aboveRoads
    }

    // MARK: Overlays put where the Terrain wants them

    /// Set while this view hands an overlay on to MapKit's own, so that
    /// whichever of these MapKit calls inside another goes straight through.
    private var passing = false

    private func through(_ body: () -> Void) {
        let was = passing
        passing = true
        body()
        passing = was
    }

    override func addOverlay(_ overlay: any MKOverlay) {
        guard !passing else { return super.addOverlay(overlay) }
        addOverlay(overlay, level: .aboveLabels)
    }

    override func addOverlay(_ overlay: any MKOverlay, level: MKOverlayLevel) {
        guard !passing else { return super.addOverlay(overlay, level: level) }
        if terrain == .raised, Self.isGround(overlay) { held.append(overlay); return }
        let put = self.level(for: overlay, asked: level)
        through { super.addOverlay(overlay, level: put) }
    }

    override func addOverlays(_ overlays: [any MKOverlay]) {
        guard !passing else { return super.addOverlays(overlays) }
        addOverlays(overlays, level: .aboveLabels)
    }

    override func addOverlays(_ overlays: [any MKOverlay], level: MKOverlayLevel) {
        guard !passing else { return super.addOverlays(overlays, level: level) }
        let ground = terrain == .raised ? overlays.filter(Self.isGround) : []
        held += ground
        let rest = overlays.filter { overlay in !ground.contains { $0 === overlay } }
        let put = terrain == .raised && level == .aboveLabels ? MKOverlayLevel.aboveRoads : level
        if put != level { for overlay in rest { lowered.insert(ObjectIdentifier(overlay)) } }
        through { super.addOverlays(rest, level: put) }
    }

    override func insertOverlay(_ overlay: any MKOverlay, at index: Int, level: MKOverlayLevel) {
        guard !passing else { return super.insertOverlay(overlay, at: index, level: level) }
        if terrain == .raised, Self.isGround(overlay) { held.insert(overlay, at: min(index, held.count)); return }
        let put = self.level(for: overlay, asked: level)
        let at = min(index, overlays(in: put).count)
        through { super.insertOverlay(overlay, at: at, level: put) }
    }

    override func insertOverlay(_ overlay: any MKOverlay, below sibling: any MKOverlay) {
        guard !passing else { return super.insertOverlay(overlay, below: sibling) }
        if terrain == .raised, Self.isGround(overlay) {
            held.insert(overlay, at: held.firstIndex { $0 === sibling } ?? 0)
        } else if held.contains(where: { $0 === sibling }) {
            // Under the chart held off: at the bottom of what is drawn.
            insertOverlay(overlay, at: 0, level: .aboveLabels)
        } else {
            through { super.insertOverlay(overlay, below: sibling) }
        }
    }

    override func removeOverlay(_ overlay: any MKOverlay) {
        guard !passing else { return super.removeOverlay(overlay) }
        held.removeAll { $0 === overlay }
        lowered.remove(ObjectIdentifier(overlay))
        through { super.removeOverlay(overlay) }
    }

    override func removeOverlays(_ overlays: [any MKOverlay]) {
        guard !passing else { return super.removeOverlays(overlays) }
        for overlay in overlays {
            held.removeAll { $0 === overlay }
            lowered.remove(ObjectIdentifier(overlay))
        }
        through { super.removeOverlays(overlays) }
    }

    // MARK: Changing the Terrain

    /// The Terrain put to the map, and the way in to `field` drawn in 3D.
    func use(_ next: MapTerrain, field: String?) {
        approach.show(next == .raised ? field : nil, on: self)
        guard next != terrain else { return }
        terrain = next
        let animated = MapMotion.animated
        if next == .raised {
            let order = overlays(in: .aboveLabels)
            held = order.filter(Self.isGround)
            let rest = order.filter { !Self.isGround($0) }
            for overlay in rest { lowered.insert(ObjectIdentifier(overlay)) }
            through {
                super.removeOverlays(order)
                super.addOverlays(rest, level: .aboveRoads)
            }
            preferredConfiguration = Self.raisedLook
            isPitchEnabled = true
            tilt(to: Self.openPitch, heading: camera.heading, animated: animated)
        } else {
            let back = overlays(in: .aboveRoads).filter { lowered.contains(ObjectIdentifier($0)) }
            // The chart and its imagery at the bottom, the rest over them in their order.
            let order = held + back
            lowered.removeAll()
            held.removeAll()
            through {
                super.removeOverlays(back)
                super.addOverlays(order, level: .aboveLabels)
            }
            preferredConfiguration = Self.flatLook
            // Flat and north up again, as the web's 3D leaves the map.
            tilt(to: 0, heading: 0, animated: animated)
            isPitchEnabled = false
        }
    }

    private func tilt(to pitch: CGFloat, heading: CLLocationDirection, animated: Bool) {
        guard let turned = camera.copy() as? MKMapCamera else { return }
        turned.pitch = pitch
        turned.heading = heading
        setCamera(turned, animated: animated)
    }
}
