import MapKit
import UIKit

/// The marks on the map reachable without finding them by touch: VoiceOver's
/// rotor on the map lists the airports, the checkpoints and the traffic in
/// view, each a flick away, in reading order (top to bottom, left to right),
/// as Apple's Maps lists its places. Each mark is the annotation view
/// already labelled for VoiceOver (AirportMarkView, CheckpointMarkView,
/// TrafficMarkView); the rotor only takes the pilot from one to the next.
enum MapRotors {
    @MainActor
    static func rotors(for map: MKMapView) -> [UIAccessibilityCustomRotor] {
        [rotor("Airports", on: map) { $0 is AirportAnnotation },
         rotor("Checkpoints", on: map) { $0 is CheckpointAnnotation },
         rotor("Traffic", on: map) { $0 is TrafficAnnotation }]
    }

    @MainActor
    private static func rotor(_ name: String, on map: MKMapView, _ include: @escaping (any MKAnnotation) -> Bool) -> UIAccessibilityCustomRotor {
        UIAccessibilityCustomRotor(name: name) { [weak map] predicate in
            guard let map else { return nil }
            let views = marks(on: map, include)
            let at = (predicate.currentItem.targetElement as? MKAnnotationView).flatMap { views.firstIndex(of: $0) }
            let next = step(from: at, count: views.count, forward: predicate.searchDirection == .next)
            return next.map { UIAccessibilityCustomRotorItemResult(targetElement: views[$0], targetRange: nil) }
        }
    }

    /// The mark after (or before) the one VoiceOver is on, the first (or
    /// the last) from none; nil past either end, where the rotor stops.
    static func step(from at: Int?, count: Int, forward: Bool) -> Int? {
        guard count > 0 else { return nil }
        let next = at.map { forward ? $0 + 1 : $0 - 1 } ?? (forward ? 0 : count - 1)
        return (0..<count).contains(next) ? next : nil
    }

    /// The views of the marks in view that are drawn, in reading order.
    @MainActor
    private static func marks(on map: MKMapView, _ include: (any MKAnnotation) -> Bool) -> [MKAnnotationView] {
        map.annotations(in: map.visibleMapRect)
            .compactMap { $0 as? any MKAnnotation }
            .filter(include)
            .compactMap { map.view(for: $0) }
            .filter { !$0.isHidden && $0.alpha > 0 }
            // Rows a hit area tall, so marks side by side read left to right.
            .map { view in (view, view.convert(CGPoint.zero, to: map)) }
            .sorted { a, b in (Int(a.1.y / WingtipSize.tapTarget), a.1.x) < (Int(b.1.y / WingtipSize.tapTarget), b.1.x) }
            .map(\.0)
    }
}
