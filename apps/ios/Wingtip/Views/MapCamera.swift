import MapKit
import SwiftUI

/// How the map's camera moves for what is on it, as the web's one camera
/// owner (lib/map/gl/camera, the flicker audit's cause D, 2026-11-14) has
/// its rules:
/// - A tap on a mark never flies the map. Its card comes up at half
///   height; only where the card would hide the mark does the map ease,
///   just enough to bring the mark above the card (easeIntoSight).
/// - A followed airplane is kept where it is on the screen: the map moves
///   by what the airplane moved, never snapping it to the middle
///   (keepOnScreen).
/// - A replay's or a dry run's airplane is brought back into sight once it
///   leaves it (keepInSight).
@MainActor
enum MapCamera {
    /// The room kept between a mark brought up and the card's top.
    private static let clearance: CGFloat = 48

    /// A mark tapped: the map eased up just enough that the card opening at
    /// half (PresentationDetent.half) does not cover it; left still where
    /// the mark is already clear of it.
    static func easeIntoSight(_ at: CLLocationCoordinate2D, on map: MKMapView) {
        guard map.bounds.height > 0 else { return }
        let top = map.bounds.height * (1 - PresentationDetent.halfShare) - clearance
        let point = map.convert(at, toPointTo: map)
        guard point.y > top else { return }
        let middle = CGPoint(x: map.bounds.midX, y: map.bounds.midY + point.y - top)
        map.setCenter(map.convert(middle, toCoordinateFrom: map), animated: MapMotion.animated)
    }

    /// A followed airplane's new report: the map moved by what it moved, so
    /// it stays where it was on the screen. Its first report, or one off
    /// the map, brings it into sight instead.
    static func keepOnScreen(from before: CLLocationCoordinate2D?, to now: CLLocationCoordinate2D, on map: MKMapView) {
        guard let before, map.visibleMapRect.contains(MKMapPoint(before)) else {
            keepInSight(now, on: map)
            return
        }
        let was = MKMapPoint(before), is_ = MKMapPoint(now), centre = MKMapPoint(map.centerCoordinate)
        let moved = MKMapPoint(x: centre.x + is_.x - was.x, y: centre.y + is_.y - was.y)
        map.setCenter(moved.coordinate, animated: MapMotion.animated)
    }

    /// A moving airplane's point brought back into the part of the map in
    /// sight, the route's padding in from its edges, once it leaves it.
    static func keepInSight(_ at: CLLocationCoordinate2D, on map: MKMapView) {
        guard map.bounds.width > 0 else { return }
        let clear = map.bounds.inset(by: ChartMap.routePadding(in: map))
        let point = map.convert(at, toPointTo: map)
        guard clear.width > 0, clear.height > 0, !clear.contains(point) else { return }
        let middle = CGPoint(x: map.bounds.midX + point.x - clear.midX, y: map.bounds.midY + point.y - clear.midY)
        // A step, not a glide, with Reduce Motion on: the replay's and the
        // dry run's airplane then jumps back into sight.
        map.setCenter(map.convert(middle, toCoordinateFrom: map), animated: MapMotion.animated)
    }
}
