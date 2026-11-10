@preconcurrency import MapKit
import UIKit

/// The dry run's airplane: a blue arrow in a white casing, as the web app
/// draws own ship, turned to its track.
final class PlaneAnnotation: MKPointAnnotation {
    var heading: Double = 0
}

final class PlaneMarkView: MKAnnotationView {
    static let reuse = "plane"
    private let arrow = UIImageView(image: UIImage(systemName: "location.north.fill"))

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        frame = CGRect(x: 0, y: 0, width: 28, height: 28)
        arrow.frame = bounds.insetBy(dx: 3, dy: 3)
        arrow.contentMode = .scaleAspectFit
        arrow.tintColor = UIColor.systemBlue
        backgroundColor = NightPalette.markFill
        layer.cornerRadius = 14
        layer.borderWidth = 1
        layer.borderColor = WingtipColor.Chart.shade.withAlphaComponent(0.4).cgColor
        addSubview(arrow)
        displayPriority = .required
        isEnabled = false
        // Not a button, but VoiceOver finds it on the map and says which
        // way it points.
        isAccessibilityElement = true
        accessibilityTraits = .image
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func turn(to degrees: Double) {
        arrow.transform = CGAffineTransform(rotationAngle: degrees * .pi / 180)
        accessibilityLabel = "The airplane, heading \(SpokenFigures.degrees(degrees))"
    }
}
