import MapKit
import UIKit

/// Where a plate's whole page lies on the chart: its four corners, the
/// page's top left, top right, bottom right and bottom left, as the planner
/// places them from the FAA's georeference of the plan view
/// (wingtip.plates). Only the plan view is to the ground's scale; the
/// briefing strip, the profile and the minimums run on round it at the
/// same scale and turn, as ForeFlight lays a plate on its map.
struct PlatePlacement: Equatable {
    /// Top left, top right, bottom right, bottom left.
    let corners: [CLLocationCoordinate2D]

    init?(corners: [CLLocationCoordinate2D]) {
        guard corners.count == 4, corners.allSatisfy({ $0.latitude.isFinite && $0.longitude.isFinite && CLLocationCoordinate2DIsValid($0) }) else { return nil }
        self.corners = corners
    }

    /// The plate as the planner places it: its whole page between the
    /// page's four corners, else, where the page is not placed (turned in
    /// the PDF), the plan view's north-up box.
    init?(_ plate: PlateOverlay) {
        if let page = plate.page {
            self.init(corners: [page.topLeft, page.topRight, page.bottomRight, page.bottomLeft].map {
                CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon)
            })
            return
        }
        self.init(corners: [
            CLLocationCoordinate2D(latitude: plate.north, longitude: plate.west),
            CLLocationCoordinate2D(latitude: plate.north, longitude: plate.east),
            CLLocationCoordinate2D(latitude: plate.south, longitude: plate.east),
            CLLocationCoordinate2D(latitude: plate.south, longitude: plate.west),
        ])
    }

    /// The picture drawn between the corners: the whole page where the
    /// planner placed it, else the plan view.
    static func picturePath(_ plate: PlateOverlay, ident: String, procedure: String) -> String {
        plate.page != nil ? Planner.platePagePath(cycle: plate.cycle, ident: ident, procedure: procedure)
            : Planner.platePicturePath(cycle: plate.cycle, ident: ident, procedure: procedure)
    }

    static func == (a: Self, b: Self) -> Bool {
        a.corners.map(\.latitude) == b.corners.map(\.latitude) && a.corners.map(\.longitude) == b.corners.map(\.longitude)
    }

    var mapPoints: [MKMapPoint] { corners.map(MKMapPoint.init) }

    /// The box round the page, which MapKit draws it within.
    var boundingMapRect: MKMapRect {
        let points = mapPoints
        let xs = points.map(\.x), ys = points.map(\.y)
        return MKMapRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    }

    /// Whether a point is on the page: inside its four sides, which may be
    /// turned off north.
    func contains(_ point: MKMapPoint) -> Bool {
        let p = mapPoints
        var inside = false
        var j = p.count - 1
        for i in p.indices {
            if (p[i].y > point.y) != (p[j].y > point.y),
               point.x < (p[j].x - p[i].x) * (point.y - p[i].y) / (p[j].y - p[i].y) + p[i].x {
                inside.toggle()
            }
            j = i
        }
        return inside
    }

    /// The page's picture, `size` points, laid on its corners by these
    /// three of them (top left, top right, bottom left) as points of the
    /// renderer: over a plate's few miles the chart's projection is as good
    /// as flat, so three corners make the whole.
    static func transform(size: CGSize, topLeft: CGPoint, topRight: CGPoint, bottomLeft: CGPoint) -> CGAffineTransform {
        guard size.width > 0, size.height > 0 else { return .identity }
        return CGAffineTransform(a: (topRight.x - topLeft.x) / size.width, b: (topRight.y - topLeft.y) / size.width,
                                 c: (bottomLeft.x - topLeft.x) / size.height, d: (bottomLeft.y - topLeft.y) / size.height,
                                 tx: topLeft.x, ty: topLeft.y)
    }
}

/// An approach plate's whole page on the chart where the planner places it,
/// under the route and the procedure's lines and over the chart: a sketch
/// to fly the dry run against, not the chart to navigate by.
final class PlateMapOverlay: NSObject, MKOverlay {
    let key: String
    /// The plate's name as the FAA writes it, for its card.
    let name: String
    let image: UIImage
    let placement: PlatePlacement
    let boundingMapRect: MKMapRect
    let coordinate: CLLocationCoordinate2D

    init(key: String, name: String, placement: PlatePlacement, image: UIImage) {
        self.key = key
        self.name = name
        self.image = image
        self.placement = placement
        boundingMapRect = placement.boundingMapRect
        coordinate = MKMapPoint(x: boundingMapRect.midX, y: boundingMapRect.midY).coordinate
    }
}

/// Draws the page white under its picture, at the card's opacity, its
/// colours turned white on black when the card asks (Invert Plate Colors).
final class PlateRenderer: MKOverlayRenderer {
    private(set) var look = PlateLook()

    init(overlay: PlateMapOverlay, look: PlateLook) {
        self.look = look
        super.init(overlay: overlay)
        alpha = CGFloat(look.opacity)
    }

    /// The card's settings changed: drawn again only where they change the
    /// page (the tags are the map's marks, not the page's).
    func show(_ next: PlateLook) {
        let was = look
        look = next
        if was.opacity != next.opacity { alpha = CGFloat(next.opacity) }
        if was.inverted != next.inverted { setNeedsDisplay() }
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        guard let plate = overlay as? PlateMapOverlay, let picture = plate.image.cgImage else { return }
        let points = plate.placement.mapPoints
        let size = plate.image.size
        let page = CGRect(origin: .zero, size: size)
        context.saveGState()
        context.concatenate(PlatePlacement.transform(size: size, topLeft: point(for: points[0]), topRight: point(for: points[1]), bottomLeft: point(for: points[3])))
        context.interpolationQuality = .high
        // The paper's white, then the page: a plan view cut black on clear
        // reads as the plate it is.
        context.setFillColor(UIColor.white.cgColor)
        context.fill(page)
        // CGContext draws upward; the page's top at its top.
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1, y: -1)
        context.draw(picture, in: page)
        if look.inverted {
            // White under a difference is each colour's opposite: the
            // page's white black, its ink white, for the night.
            context.setBlendMode(.difference)
            context.fill(page)
        }
        context.restoreGState()
    }
}
