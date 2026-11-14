import MapKit
import UIKit

/// The VORs on the chart (the FAA's VOR, VOR/DME and VORTAC, from the
/// phone's cycle packs through the engine's navaids_in_view), kept apart
/// from the rest of the overlays (ChartOverlays): what one is, its mark,
/// and a tap on it its card (NavaidCard).

/// A VOR, VOR/DME or VORTAC in view (VorPin).
struct VorPin: Decodable, Equatable, Sendable {
    let ident: String
    var name: String?
    let kind: String
    var freq: String?
    let lat: Double
    let lon: Double
    /// What its card says of it (NavaidCard), as the engine's
    /// navaids_in_view reads NASR's NAV_BASE: its magnetic variation, east
    /// positive; its elevation; its DME channel; its standard service
    /// volume's code (AIM 1-1-8); its hours; whether it is in service with
    /// restrictions, and its remarks.
    var magVar: Double?
    var elevationFt: Double?
    var channel: String?
    var serviceVolume: String?
    var hours: String?
    var restricted: Bool?
    var remarks: [String]?

    /// Its link's key and its card's (`navaid=`, the web's navaidAt):
    /// "OBK@42.2214,-87.9517", the ident and its place, as one ident names
    /// navaids in more than one place.
    var key: String { NavaidKey(ident: ident, lat: lat, lon: lon).text }
}

// MARK: - VORs

final class VorAnnotation: NSObject, MKAnnotation {
    let vor: VorPin
    let coordinate: CLLocationCoordinate2D

    init(_ vor: VorPin) {
        self.vor = vor
        coordinate = CLLocationCoordinate2D(latitude: vor.lat, longitude: vor.lon)
    }

    /// Its ident and frequency as ForeFlight writes them: "GCO (108.25)".
    var tag: String { vor.freq.map { "\(vor.ident) (\($0))" } ?? vor.ident }
}

/// A VOR: the chart's hexagon in the sectional's blue, with its ident and
/// frequency on a blue tag beside it (FAA Aeronautical Chart User's Guide,
/// Radio Aids to Navigation; the web map's NAVAID_PICTURES and navaidMarks).
final class VorMarkView: MKAnnotationView {
    static let reuse = "vor"
    private static let hexagon: UIImage = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { context in
        let cg = context.cgContext
        let points = [(15.0, 8.0), (11.5, 14.06), (4.5, 14.06), (1.0, 8.0), (4.5, 1.94), (11.5, 1.94)]
        cg.move(to: CGPoint(x: points[0].0, y: points[0].1))
        for p in points.dropFirst() { cg.addLine(to: CGPoint(x: p.0, y: p.1)) }
        cg.closePath()
        cg.setFillColor(UIColor.white.cgColor)
        cg.setStrokeColor(SectionalInk.blue.cgColor)
        cg.setLineWidth(2)
        cg.drawPath(using: .fillStroke)
        cg.setFillColor(SectionalInk.blue.cgColor)
        cg.fillEllipse(in: CGRect(x: 6.4, y: 6.4, width: 3.2, height: 3.2))
    }
    private let mark = UIImageView(image: VorMarkView.hexagon)
    private let tagLabel = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        tagLabel.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        tagLabel.textColor = .white
        tagLabel.backgroundColor = SectionalInk.blue
        tagLabel.textAlignment = .center
        tagLabel.layer.cornerRadius = 3
        tagLabel.layer.masksToBounds = true
        addSubview(mark)
        addSubview(tagLabel)
        canShowCallout = false
        // A tap opens its card (NavaidCard), as the web's VOR does.
        isAccessibilityElement = true
        accessibilityTraits = .button
        collisionMode = .rectangle
        displayPriority = MKFeatureDisplayPriority(rawValue: 550)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    private func show() {
        guard let vor = annotation as? VorAnnotation else { return }
        tagLabel.text = vor.tag
        tagLabel.sizeToFit()
        let tagSize = CGSize(width: tagLabel.bounds.width + 8, height: tagLabel.bounds.height + 2)
        let height = max(16, tagSize.height)
        mark.frame = CGRect(x: 0, y: (height - 16) / 2, width: 16, height: 16)
        tagLabel.frame = CGRect(x: 20, y: (height - tagSize.height) / 2, width: tagSize.width, height: tagSize.height)
        frame.size = CGSize(width: 20 + tagSize.width, height: height)
        // The hexagon's middle on the VOR.
        centerOffset = CGPoint(x: frame.width / 2 - 8, y: 0)
        accessibilityLabel = "\(vor.vor.kind) \(vor.vor.ident)\(vor.vor.freq.map { ", \($0)" } ?? "")"
    }
}
