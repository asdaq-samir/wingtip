import MapKit
import UIKit

/// A field on the chart: its mark in the sectional's own symbology, as
/// the web map draws it over the chart (lib/map/airportMark.ts
/// sectionalAirportSvg), its ident beside it in the field's ink, and its
/// flight category a pip where it reports one.
final class AirportAnnotation: NSObject, MKAnnotation {
    let ident: String
    let kind: String
    let category: String?
    /// The class of airspace at the field's surface (B, C, D, E, G), for
    /// how soon its mark must show.
    let airspaceClass: String?
    /// The class of airspace (B, C, D) the field is the primary airport
    /// of (AirportPin.primaryOf), or nil: the one mark the rings are named
    /// for, kept before any other where they would collide.
    let primaryOf: String?
    /// Whether it has a control tower, nil where not known (AirportPin.towered).
    let towered: Bool?
    /// What the symbol says of its use: "military", "private" or nil.
    let use: String?
    let coordinate: CLLocationCoordinate2D
    /// A field of the route (its ends and stops): always drawn, never
    /// dropped where marks collide (priority).
    var onRoute = false

    init(_ pin: AirportPin, onRoute: Bool = false) {
        ident = pin.ident
        kind = pin.kind
        category = pin.flightCategory
        airspaceClass = pin.airspaceClass
        primaryOf = pin.primaryOf
        towered = pin.towered
        use = pin.military == "military" ? "military" : pin.isPrivate == true ? "private" : nil
        coordinate = CLLocationCoordinate2D(latitude: pin.lat, longitude: pin.lon)
        self.onRoute = onRoute
    }

    var title: String? { ident }

    /// Which marks MapKit keeps when they would overlap, as the web app's
    /// AirportsLayer ranks the fields far out (PRIMARY_RANK, shownFrom
    /// and KIND_RANK: the field each class of airspace is named for
    /// before every other, so Dallas's rings show DFW and not Love, then
    /// a Class B field from the country's zoom, a Class C from a few
    /// states', the airline airports before the regional ones, the small
    /// fields at the sectional's own scale): the route's fields always,
    /// then the primaries of Class B and C, then the large and the Class B
    /// and C, then the primary of a Class D, then medium and Class D,
    /// then the rest. Hundreds of views at a low zoom drew over each
    /// other with nothing dropping any (the owner, 2026-11-03).
    var priority: MKFeatureDisplayPriority {
        if onRoute { return .required }
        switch primaryOf {
        case "B": return MKFeatureDisplayPriority(rawValue: 900)
        case "C": return MKFeatureDisplayPriority(rawValue: 800)
        default: break
        }
        if kind == "large" || airspaceClass == "B" || airspaceClass == "C" { return .defaultHigh }
        if primaryOf == "D" { return MKFeatureDisplayPriority(rawValue: 700) }
        if kind == "medium" || airspaceClass == "D" { return MKFeatureDisplayPriority(rawValue: 500) }
        return .defaultLow
    }

    /// The field's flight category as its pip draws it (FlightCategory).
    var colour: UIColor { FlightCategory.mark(category) }
}

/// The mark: the sectional's symbol (SectionalSymbol) with the ident to
/// its right in bold, in the field's ink on a halo, as the web map sets
/// it (glOverlays' airportMarksLayer). One view class reused for every
/// field; the symbol grows a little closer in (SectionalSymbol.scale).
final class AirportMarkView: MKAnnotationView {
    static let reuse = "airport"
    private let symbol = UIImageView()
    private let label = UILabel()
    /// The symbol's box, the mark's height, and the gap to the ident.
    static let box: CGFloat = 26
    static let height: CGFloat = 30
    private static let gap: CGFloat = 2

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        symbol.frame = CGRect(x: 0, y: (Self.height - Self.box) / 2, width: Self.box, height: Self.box)
        label.font = UIFont.systemFont(ofSize: 12, weight: .bold)
        // A halo round the words, white by day and the night's ground in
        // dark appearance (NightPalette.halo), as the web map's LABEL_HALO.
        label.haloFollowing(self)
        addSubview(symbol)
        addSubview(label)
        canShowCallout = false
        // A tap opens the field's card, so VoiceOver has it as a button
        // named with its weather, which the pip's colour alone would not
        // tell.
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        show()
    }

    /// The tap's area 44 points tall round a mark drawn 30: the view's
    /// own frame is what MapKit collides, and a taller one dropped more of
    /// its neighbours.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: 0, dy: -(44 - Self.height) / 2).contains(point)
    }

    /// The symbol drawn at a zoom's size (SectionalSymbol.scale).
    func scaleSymbol(_ scale: CGFloat) {
        symbol.transform = CGAffineTransform(scaleX: scale, y: scale)
    }

    private func show() {
        guard let field = annotation as? AirportAnnotation else { return }
        let ink = SectionalInk.airport(towered: field.towered)
        symbol.image = SectionalSymbol.image(towered: field.towered, kind: field.kind, use: field.use, category: field.category)
        label.text = field.ident
        label.textColor = ink
        label.sizeToFit()
        let width = Self.box + Self.gap + label.bounds.width
        frame.size = CGSize(width: width, height: Self.height)
        label.frame.origin = CGPoint(x: Self.box + Self.gap, y: (Self.height - label.bounds.height) / 2)
        // The symbol's middle on the field, the ident running off to its
        // right.
        centerOffset = CGPoint(x: width / 2 - Self.box / 2, y: 0)
        accessibilityLabel = "\(field.ident), \(SpokenFigures.flightCategory(field.category))"
        // MapKit drops the lesser of two marks that collide, by these, as
        // the web map's symbol collision does (glOverlays' airportMarksLayer:
        // a busy area keeps its biggest fields, the rest come in as it is
        // zoomed): no clusters, which hid O'Hare in a count over Chicago.
        displayPriority = field.priority
        collisionMode = .rectangle
    }
}

/// The sectional's airport symbol (FAA Aeronautical Chart User's Guide,
/// VFR Terms and Symbols, Airports: blue for a field with a control
/// tower, magenta for every other) as ForeFlight draws it and the web map
/// (sectionalAirportSvg, the owner's screenshot over Madison,
/// 2026-11-08): a ring in the field's ink round a white disc with a dot
/// of the ink in its middle, inside a white halo, sized by the field; a
/// private field (NASR FACILITY_USE_CODE PR) the guide's circle with an
/// R, a military one with an M; the field's flight category a small pip
/// at its lower right where it reports one. Drawn once for each look and
/// kept.
enum SectionalSymbol {
    /// The disc's radius by the field's size, the big fields the biggest
    /// so the small ones don't crowd the chart at a distance (web
    /// SECTIONAL_RADIUS).
    static func radius(_ kind: String) -> CGFloat {
        switch kind {
        case "large": return 8.5
        case "medium": return 7.5
        case "small": return 6.5
        default: return 6
        }
    }

    /// The symbol's size at a zoom (Leaflet's level, MapExtras.zoom), as the
    /// web map's icon-size: 0.7 a few states across, 1 at 10, 1.25 from 13.
    static func scale(zoom: Double) -> CGFloat {
        if zoom <= 4 { return 0.7 }
        if zoom <= 10 { return CGFloat(0.7 + 0.3 * (zoom - 4) / 6) }
        if zoom <= 13 { return CGFloat(1 + 0.25 * (zoom - 10) / 3) }
        return 1.25
    }

    @MainActor private static var drawn: [String: UIImage] = [:]

    @MainActor
    static func image(towered: Bool?, kind: String, use: String?, category: String?) -> UIImage {
        let key = "\(towered.map { $0 ? "t" : "u" } ?? "-")|\(kind)|\(use ?? "")|\(category ?? "")"
        if let kept = drawn[key] { return kept }
        let ink = SectionalInk.airport(towered: towered)
        let pip = category.map { FlightCategory.mark($0) }
        let box = AirportMarkView.box
        let image = UIGraphicsImageRenderer(size: CGSize(width: box, height: box)).image { context in
            let cg = context.cgContext
            let middle = CGPoint(x: box / 2, y: box / 2)
            func circle(_ at: CGPoint, _ r: CGFloat) -> CGRect { CGRect(x: at.x - r, y: at.y - r, width: 2 * r, height: 2 * r) }
            let r: CGFloat = use == nil ? radius(kind) : 7
            // The halo, 2.5 points past the ring.
            cg.setFillColor(UIColor.white.cgColor)
            cg.fillEllipse(in: circle(middle, r + 2.5))
            cg.setStrokeColor(ink.cgColor)
            if let use {
                cg.setLineWidth(2)
                cg.strokeEllipse(in: circle(middle, r))
                let letter = NSAttributedString(string: use == "military" ? "M" : "R", attributes: [
                    .font: UIFont.systemFont(ofSize: 9.5, weight: .heavy), .foregroundColor: ink,
                ])
                let size = letter.size()
                letter.draw(at: CGPoint(x: middle.x - size.width / 2, y: middle.y - size.height / 2))
            } else {
                cg.setLineWidth(2.6)
                cg.strokeEllipse(in: circle(middle, r))
                cg.setFillColor(ink.cgColor)
                cg.fillEllipse(in: circle(middle, r * 0.42))
            }
            if let pip {
                cg.setFillColor(pip.cgColor)
                cg.setStrokeColor(UIColor.white.cgColor)
                cg.setLineWidth(1.3)
                cg.addEllipse(in: circle(CGPoint(x: middle.x + r * 0.78, y: middle.y + r * 0.78), 3.4))
                cg.drawPath(using: .fillStroke)
            }
        }
        drawn[key] = image
        return image
    }
}
