import MapKit
import UIKit

/// A field on the chart: its mark in the sectional's own symbology, as
/// the web map draws it over the chart (lib/map/airportMark.ts
/// sectionalAirportSvg), its ident beside it in the field's ink, and its
/// weather where it reports (FieldWeatherMark): the flight category's
/// halo, the wind and the ↓, as Settings' Airport Weather asks.
final class AirportAnnotation: NSObject, MKAnnotation {
    let ident: String
    let kind: String
    /// The flight category as the in-view answer gave it; the weather
    /// joined on later (FieldWeatherMarks) says it where that did not.
    private let pinCategory: String?
    /// The field's weather as its mark draws it, nil until it is in.
    var weather: FieldWeatherMark?
    var category: String? { weather?.category ?? pinCategory }
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
        pinCategory = pin.flightCategory
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

    /// The field's flight category as its halo draws it (FlightCategory).
    var colour: UIColor { FlightCategory.mark(category) }

    /// What VoiceOver says of the mark: "KJVL, IFR, wind 220 at 18
    /// gusting 26", and the ↓ where it shows.
    var spoken: String {
        guard let weather else { return "\(ident), \(SpokenFigures.flightCategory(category))" }
        return "\(ident), \(weather.spoken)"
    }
}

/// The mark: the sectional's symbol (SectionalSymbol) with the ident to
/// its right in bold, in the field's ink on a halo, as the web map sets
/// it (glOverlays' airportMarksLayer). One view class reused for every
/// field; the symbol grows a little closer in (SectionalSymbol.scale).
final class AirportMarkView: MKAnnotationView {
    static let reuse = "airport"
    /// The symbol, the ident, the ring and the weather, moved together
    /// within the view where a far barb widens it (`show`).
    private let content = UIView()
    private let symbol = UIImageView()
    private let label = UILabel()
    /// The ring round the field whose card is open (SelectedHalo).
    private let halo = SelectedHalo()
    /// The barb, the station model's lines and the ↓ (FieldWeatherLayer).
    private let weatherLayer = FieldWeatherLayer()
    /// The mark itself within the view, symbol and ident: the tap's area.
    private var markFrame = CGRect.zero
    /// Settings' Airport Weather, the map's zoom and its heading, as the
    /// coordinator last told them (`weather(_:zoom:heading:on:)`).
    static var choice = AirportWeatherChoice()
    static var zoom: Double = 0
    static var heading: Double = 0
    /// The ident of the field whose card is open, whose mark wears the
    /// ring and is never dropped for another: one at a time, as one card
    /// is open at a time.
    static var selected: String?
    /// The symbol's box, the mark's height, and the gap to the ident.
    static let box: CGFloat = 26
    static let height: CGFloat = 30
    private static let gap: CGFloat = 2

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        // The symbol's image is wider than the box, for its halo; centred
        // on the box's middle, the frame MapKit collides kept the box's.
        let side = SectionalSymbol.side
        symbol.frame = CGRect(x: (Self.box - side) / 2, y: (Self.height - side) / 2, width: side, height: side)
        label.font = UIFont.systemFont(ofSize: 12, weight: .bold)
        // A halo round the words, white by day and the night's ground in
        // dark appearance (NightPalette.halo), as the web map's LABEL_HALO.
        label.haloFollowing(self)
        halo.place(round: CGPoint(x: Self.box / 2, y: Self.height / 2))
        content.layer.addSublayer(halo)
        content.layer.addSublayer(weatherLayer)
        content.addSubview(symbol)
        content.addSubview(label)
        content.isUserInteractionEnabled = false
        addSubview(content)
        canShowCallout = false
        // A tap opens the field's card, so VoiceOver has it as a button
        // named with its weather, which the halo's colour alone would not
        // tell.
        isAccessibilityElement = true
        accessibilityTraits = .button
        // Held, the field's card as a preview and the plan's actions
        // (AirportMarkMenu), as UIKit previews a link.
        AirportMarkMenu.shared.attach(to: self)
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

    /// The tap's area 44 points tall round a mark drawn 30, the symbol
    /// and the ident only: the view's own frame is what MapKit collides,
    /// a far barb's room in it too, and a taller one dropped more of its
    /// neighbours.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        markFrame.insetBy(dx: 0, dy: -(44 - Self.height) / 2).contains(point)
    }

    /// The symbol drawn at a zoom's size (SectionalSymbol.scale).
    func scaleSymbol(_ scale: CGFloat) {
        symbol.transform = CGAffineTransform(scaleX: scale, y: scale)
    }

    private func show() {
        guard let field = annotation as? AirportAnnotation else { return }
        let ink = SectionalInk.airport(towered: field.towered)
        let choice = Self.choice
        // A stale report's halo grey (FlightCategory's no-report colour),
        // its age beside the ident.
        let stale = field.weather?.heardAgo
        symbol.image = SectionalSymbol.image(towered: field.towered, kind: field.kind, use: field.use,
                                             category: stale != nil && field.category != nil ? "STALE" : field.category, style: choice.style)
        label.text = stale.map { "\(field.ident) · \($0)" } ?? field.ident
        label.textColor = ink
        label.sizeToFit()
        let width = Self.box + Self.gap + label.bounds.width
        let mark = CGRect(x: 0, y: 0, width: width, height: Self.height)
        content.frame.size = mark.size
        label.frame.origin = CGPoint(x: Self.box + Self.gap, y: (Self.height - label.bounds.height) / 2)
        let middle = CGPoint(x: Self.box / 2, y: Self.height / 2)
        let room = weatherLayer.show(field.weather, choice: choice, station: choice.station(zoom: Self.zoom), far: FarBarb.scale(zoom: Self.zoom),
                                     heading: Self.heading, middle: middle,
                                     symbolRadius: SectionalSymbol.reach(kind: field.kind, use: field.use, halo: field.category != nil && choice.style == .halo),
                                     linesAt: CGPoint(x: Self.box + Self.gap, y: label.frame.maxY - 1))
        // The view the mark and its far barb's room, so MapKit's collision
        // has a barb give way to another's, the lesser field's, as the
        // web's far barbs give way (AirportWeatherGl's icon-allow-overlap
        // off), rather than piling up; the mark within it moved to suit.
        let all = room.map { mark.union($0) } ?? mark
        let shift = CGPoint(x: -all.minX, y: -all.minY)
        frame.size = all.size
        content.frame.origin = shift
        markFrame = mark.offsetBy(dx: shift.x, dy: shift.y)
        // The symbol's middle on the field, the ident running off to its
        // right.
        centerOffset = CGPoint(x: all.width / 2 - (middle.x + shift.x), y: all.height / 2 - (middle.y + shift.y))
        accessibilityLabel = field.spoken
        // MapKit drops the lesser of two marks that collide, by these, as
        // the web map's symbol collision does (glOverlays' airportMarksLayer:
        // a busy area keeps its biggest fields, the rest come in as it is
        // zoomed): no clusters, which hid O'Hare in a count over Chicago.
        let picked = field.ident == Self.selected
        displayPriority = picked ? .required : field.priority
        collisionMode = .rectangle
        halo.isHidden = !picked
        zPriority = picked ? .max : .defaultUnselected
    }

    /// The weather drawn again on every mark in view, as a setting, the
    /// zoom's side of the station model's, the far barbs' size or the
    /// map's heading changes; nothing done while all are the same.
    static func weather(_ choice: AirportWeatherChoice, zoom: Double, heading: Double, on map: MKMapView) {
        let station = choice.station(zoom: zoom) != Self.choice.station(zoom: Self.zoom)
            || FarBarb.scale(zoom: zoom) != FarBarb.scale(zoom: Self.zoom)
        let turned = abs(heading - Self.heading) > 0.5
        let changed = choice != Self.choice
        Self.zoom = zoom
        guard changed || station || turned else { return }
        Self.choice = choice
        Self.heading = heading
        for case let field as AirportAnnotation in map.annotations {
            (map.view(for: field) as? AirportMarkView)?.show()
        }
    }

    /// The field's weather put on its view, as it comes in.
    static func weather(of field: AirportAnnotation, on map: MKMapView) {
        (map.view(for: field) as? AirportMarkView)?.show()
    }

    /// The ring moved to `ident`'s mark from the one that wore it, as its
    /// card opens or closes; nothing done while it is the same.
    static func select(_ ident: String?, on map: MKMapView) {
        guard ident != selected else { return }
        let was = selected
        selected = ident
        for case let field as AirportAnnotation in map.annotations where field.ident == was || field.ident == ident {
            (map.view(for: field) as? AirportMarkView)?.show()
        }
    }
}

/// The ring round the field whose card is open, as the web map draws it
/// (AirportsGl's RING): the brand's Taxiway Yellow (chart.selected, the
/// owner, 2026-11-09) 3 points wide, 20 from the field, cased in white
/// (chart.casing) and then the shade's dark edge at about half strength
/// (chart.shade), as a picked point's ring is. Yellow alone is about
/// 1.6:1 on the sectional's yellow towns and 1.4:1 on its pale greens;
/// the dark edge holds on every part of the chart, by day and dimmed at
/// night. Drawn outside the mark's frame, so it does not change what
/// MapKit collides.
final class SelectedHalo: CALayer {
    static let radius: CGFloat = 20

    override init() {
        super.init()
        for (colour, width) in [(WingtipColor.Chart.shade.withAlphaComponent(0.55), 9.0), (WingtipColor.Chart.casing, 6), (WingtipColor.Chart.selected, 3)] {
            let ring = CAShapeLayer()
            ring.fillColor = nil
            ring.strokeColor = colour.cgColor
            ring.lineWidth = width
            addSublayer(ring)
        }
        isHidden = true
    }

    override init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Centred on the symbol's middle.
    func place(round middle: CGPoint) {
        let r = Self.radius
        frame = CGRect(x: middle.x - r, y: middle.y - r, width: 2 * r, height: 2 * r)
        let path = UIBezierPath(ovalIn: bounds).cgPath
        for case let ring as CAShapeLayer in sublayers ?? [] {
            ring.frame = bounds
            ring.path = path
        }
    }
}
