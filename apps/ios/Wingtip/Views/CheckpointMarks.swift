import MapKit
import UIKit

/// A checkpoint on the chart as the web app draws it (lib/map/icons.ts
/// dotIcon): a numbered dot in the colour of the chart model's score for
/// it, in a white casing with a dark hairline outside, so it holds over
/// any chart colour, and its name beside it.
final class CheckpointAnnotation: NSObject, MKAnnotation {
    let number: Int
    let name: String
    let score: Double
    let coordinate: CLLocationCoordinate2D

    init(number: Int, checkpoint: Checkpoint) {
        self.number = number
        name = checkpoint.name ?? checkpoint.waypoint ?? checkpoint.category
        score = checkpoint.predictedScore
        coordinate = CLLocationCoordinate2D(latitude: checkpoint.lat, longitude: checkpoint.lon)
    }

    var title: String? { name }

    /// The rating scale's steps (lib/scoreScale SCORE_STEPS, format.ts
    /// scoreColor): the deeper the brown, the better the checkpoint.
    static func colour(for score: Double) -> UIColor {
        UIColor(hex: score >= 4.5 ? 0x4E3406 : score >= 4.0 ? 0x724D09 : score >= 3.5 ? 0x96660E : score >= 3.0 ? 0xB98014 : 0xD99A1E)
    }

    /// White on the three deeper steps, ink on the two palest, as the web
    /// app's inkOn picks it.
    static func ink(for score: Double) -> UIColor { score >= 3.5 ? .white : UIColor(white: 0.1, alpha: 1) }

    /// The names from this zoom in (Leaflet's levels, MapExtras.zoom): out
    /// further, the numbered dots alone, as the web map's checkpoint labels
    /// come in with the zoom. The UI audit of 2026-11-09 (item 5) found the
    /// names piled into a stack over the route at the route's own zoom.
    static let namesFromZoom = 8.0

    /// Which mark gives way where two meet, as the airport marks' priority
    /// does (AirportAnnotation.priority): the better the chart model's
    /// score, the longer a checkpoint stays, all of them under the route's
    /// own fields (.required) and over the plain fields (.defaultHigh is
    /// 750) only at the top of the scale.
    static func priority(for score: Double) -> MKFeatureDisplayPriority {
        MKFeatureDisplayPriority(rawValue: 500 + Float(max(0, min(5, score))) * 80)
    }
}

final class CheckpointMarkView: MKAnnotationView {
    static let reuse = "checkpoint"
    private let dot = UILabel()
    private let name = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        frame = CGRect(x: 0, y: 0, width: 24, height: 24)
        dot.frame = bounds
        dot.layer.cornerRadius = 12
        dot.layer.borderWidth = 2.5
        dot.layer.borderColor = UIColor.white.cgColor
        dot.layer.masksToBounds = true
        dot.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        dot.textAlignment = .center
        // The dark hairline outside the white casing and the shadow under
        // it, on a ring round the dot so the dot's own layer stays clipped
        // and the view can widen for the name.
        let ring = UIView(frame: dot.frame)
        ring.layer.cornerRadius = 12
        ring.layer.borderWidth = 1
        ring.layer.borderColor = UIColor(red: 10 / 255, green: 20 / 255, blue: 28 / 255, alpha: 0.55).cgColor
        ring.layer.shadowColor = UIColor.black.cgColor
        ring.layer.shadowOpacity = 0.45
        ring.layer.shadowRadius = 2
        ring.layer.shadowOffset = CGSize(width: 0, height: 1)
        ring.isUserInteractionEnabled = false
        addSubview(ring)
        addSubview(dot)
        // The name in the chart's own ink on a paper-white tab, as the
        // sectional prints its labels, not black capitals.
        name.font = UIFont.systemFont(ofSize: 11, weight: .semibold)
        name.textColor = WingtipColor.Chart.fixInk
        name.backgroundColor = UIColor(white: 1, alpha: 0.85)
        name.layer.cornerRadius = WingtipSpace.xs
        name.layer.masksToBounds = true
        addSubview(name)
        canShowCallout = false
        // Marks that meet give way by their score, the dot and its name
        // as one rectangle (the view's frame takes the name in).
        collisionMode = .rectangle
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    private func show() {
        guard let point = annotation as? CheckpointAnnotation else { return }
        dot.text = String(point.number)
        dot.backgroundColor = CheckpointAnnotation.colour(for: point.score)
        dot.textColor = CheckpointAnnotation.ink(for: point.score)
        // In sentence case with its codes kept, as the web labels it
        // (RouteMap labelOf), where a waypoint's capitals shouted.
        name.text = " \(AirportWords.faaWords(point.name)) "
        displayPriority = CheckpointAnnotation.priority(for: point.score)
        // The number and the name, with the colour's meaning in words
        // (the guide's bands): the dot's brown says it to the eye only.
        accessibilityLabel = "Checkpoint \(point.number), \(point.name), rated \(SpokenFigures.number(point.score, decimals: 1)) of five"
        name.sizeToFit()
        // Beside the dot on its right, a gap away, as the web app's label.
        name.frame = CGRect(x: 24 + WingtipSpace.sm, y: (24 - 18) / 2, width: name.bounds.width, height: 18)
        showName(namesShown)
    }

    private var namesShown = false

    /// The name shown or not at the map's zoom; the view's frame takes the
    /// name in while it shows, so a crowded route's marks give way whole,
    /// and the dot stays on the checkpoint (centerOffset).
    func showName(_ shown: Bool) {
        namesShown = shown
        name.isHidden = !shown
        let width = shown ? name.frame.maxX : 24
        bounds = CGRect(x: 0, y: 0, width: width, height: 24)
        centerOffset = CGPoint(x: (width - 24) / 2, y: 0)
    }
}
