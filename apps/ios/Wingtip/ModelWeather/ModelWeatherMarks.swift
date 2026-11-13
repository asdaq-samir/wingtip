import MapKit
import UIKit

/// A G-AIRMET's label in its hazard's colour with the chart's halo, as
/// aviationweather.gov labels its own ("SfcWind"). Gives way to the
/// fields' and the route's marks.
final class AirmetLabelView: MKAnnotationView {
    static let reuse = "airmet-label"
    private let label = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        label.font = UIFont.preferredFont(forTextStyle: .caption2).bold
        label.adjustsFontForContentSizeCategory = true
        label.haloFollowing(self)
        addSubview(label)
        canShowCallout = false
        displayPriority = .defaultLow
        collisionMode = .rectangle
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func show(_ mark: AirmetLabel) {
        label.text = mark.text
        label.textColor = mark.colour
        label.sizeToFit()
        frame = CGRect(origin: .zero, size: label.bounds.size)
        accessibilityLabel = "G-AIRMET, \(mark.text)"
    }
}

/// The value at the point tapped, a round badge as Apple Weather's maps
/// have it (the web's FlowBubble): what it is, the figure, its unit or
/// word; white, or dark on the precipitation, as the web's.
final class FlowBadgeView: MKAnnotationView {
    static let reuse = "flow-badge"
    static let size: CGFloat = 56
    private let over = UILabel(), figure = UILabel(), under = UILabel()
    private let stack: UIStackView

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        stack = UIStackView(arrangedSubviews: [over, figure, under])
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        frame = CGRect(x: 0, y: 0, width: Self.size, height: Self.size)
        layer.cornerRadius = Self.size / 2
        layer.shadowOpacity = 0.25
        layer.shadowRadius = WingtipSpace.xs
        layer.shadowOffset = .zero
        stack.axis = .vertical
        stack.alignment = .center
        stack.frame = bounds.insetBy(dx: WingtipSpace.xs, dy: WingtipSpace.xs)
        stack.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        for (label, style) in [(over, UIFont.TextStyle.caption2), (figure, .headline), (under, .caption2)] {
            label.font = UIFont.monospacedDigitSystemFont(ofSize: UIFont.preferredFont(forTextStyle: style).pointSize,
                                                          weight: label === figure ? .bold : .semibold)
            label.textAlignment = .center
            label.adjustsFontSizeToFitWidth = true
            label.minimumScaleFactor = 0.6
        }
        addSubview(stack)
        canShowCallout = false
        displayPriority = .required
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func show(_ reading: FlowReading?, dark: Bool) {
        backgroundColor = dark ? UIColor.black.withAlphaComponent(0.8) : .white
        let ink: UIColor = dark ? .white : .black
        over.text = reading?.over
        over.isHidden = reading?.over == nil
        figure.text = reading?.figure ?? "–"
        under.text = reading.map { $0.under.uppercased() }
        under.isHidden = (reading?.under ?? "").isEmpty
        over.textColor = ink.withAlphaComponent(0.6)
        figure.textColor = ink
        under.textColor = ink.withAlphaComponent(0.6)
        accessibilityLabel = reading.map { [$0.over, $0.figure, $0.under].compactMap { $0 }.joined(separator: " ") } ?? "No value here"
    }
}

extension UIFont {
    /// The same font, bold.
    fileprivate var bold: UIFont {
        fontDescriptor.withSymbolicTraits(.traitBold).map { UIFont(descriptor: $0, size: 0) } ?? self
    }
}

extension ModelWeather {
    /// The G-AIRMETs' labels by hazard, AWC's short names as the engine
    /// has them (`gairmet_hazards`); none and why where it could not say,
    /// for the bar to show rather than an outline's label to hide.
    static func airmetLabels() -> (labels: [String: String], problem: String?) {
        do {
            return (try Engine.gairmetHazards().labels, nil)
        } catch {
            return ([:], "The G-AIRMETs' hazard names couldn't be read: \(error.localizedDescription)")
        }
    }
}
