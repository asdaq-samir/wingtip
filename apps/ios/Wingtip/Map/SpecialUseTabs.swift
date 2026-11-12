import MapKit
import UIKit

/// The special-use areas' tabs, as ForeFlight writes them on a MOA's or a
/// restricted area's boundary over the sectional (the owner's screenshot
/// near Brady, TX, 2026-11-12) and the web draws them (glSuaLabels): a
/// dark tab bordered in the area's ink, white bold type, its name over its
/// altitudes, "M-BRADY NOR*:" over "3600-17999", its long side along the
/// area's longest side and just inside it. The name, the limits' figures
/// and references, the place and the turn are the engine's
/// (special_use_in_view's `tab`, crate::sua_tab); the words of the limits
/// are written here, as the web's style writes them.
enum SpecialUseTab {
    /// From the zoom of the Class B, C and D tabs (the web's
    /// AIRSPACE_LABELS_FROM).
    static let from = 8.0
    /// How far off the line the tab's middle sits, towards the area: about
    /// half its two lines' height, so its edge meets the line (the web's
    /// INSIDE_EM, 1.35 ems of 11 points).
    static let inside: CGFloat = 15

    /// A limit as the tab writes it, whole feet and no comma (the web's
    /// limitText): "SFC", "UNL", "500AGL", "FL180", "3600"; nil with no
    /// figure where one is needed.
    static func limit(_ ft: Double?, ref: String) -> String? {
        switch ref {
        case "SFC": return "SFC"
        case "UNL": return "UNL"
        default:
            guard let ft else { return nil }
            switch ref {
            case "AGL": return "\(Int(ft.rounded()))AGL"
            case "FL": return "FL\(Int((ft / 100).rounded()))"
            default: return "\(Int(ft.rounded()))"
            }
        }
    }

    /// The tab's floor and ceiling as it writes them, nil where either
    /// has no words.
    static func limits(_ tab: ChartMarks.Area.Tab) -> (floor: String, ceiling: String)? {
        guard let floor = limit(tab.floorFt, ref: tab.floorRef), let ceiling = limit(tab.ceilingFt, ref: tab.ceilingRef) else { return nil }
        return (floor, ceiling)
    }

    /// The tab's turn on the screen with the map's heading taken off,
    /// kept upright (-90 to 90), and which side of the text the area then
    /// lies on: each half turn to keep it upright puts the area on the
    /// text's other side.
    static func turn(angle: Double, side: Double, heading: Double) -> (angle: Double, side: Double) {
        var turn = angle - heading, side = side
        while turn > 90 { turn -= 180; side = -side }
        while turn <= -90 { turn += 180; side = -side }
        return (turn, side)
    }
}

final class SpecialUseTabAnnotation: NSObject, MKAnnotation {
    let area: ChartMarks.Area
    let tab: ChartMarks.Area.Tab
    let limits: (floor: String, ceiling: String)
    let coordinate: CLLocationCoordinate2D
    /// Its two lines: "M-BRADY NOR*:" over "3600-17999".
    var text: String { "\(tab.name):\n\(limits.floor)-\(limits.ceiling)" }

    init?(_ area: ChartMarks.Area) {
        guard let tab = area.tab, tab.at.count == 2, let limits = SpecialUseTab.limits(tab) else { return nil }
        self.area = area
        self.tab = tab
        self.limits = limits
        coordinate = CLLocationCoordinate2D(latitude: tab.at[0], longitude: tab.at[1])
    }
}

/// The tab: white bold type in a dark rounded box bordered in its area's
/// ink, turned along its side and set just inside it, the app's Class B,
/// C and D tabs' look (AirspaceTabView). Tabs give way to one another and
/// to the fields by MapKit's collision, a restricted area's before a
/// MOA's it lies in, as its line is drawn over the MOA's.
final class SpecialUseTabView: MKAnnotationView {
    static let reuse = "special-use-tab"
    /// The map's heading the tabs are turned for, as ChartMarks last told it.
    static var heading: Double = 0
    private let box = UIView()
    private let label = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        box.backgroundColor = WingtipColor.Chart.tag.withAlphaComponent(0.92)
        box.layer.cornerRadius = 3
        box.layer.borderWidth = 1.5
        label.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        label.textColor = WingtipColor.Chart.casing
        label.numberOfLines = 2
        label.textAlignment = .center
        addSubview(box)
        box.addSubview(label)
        canShowCallout = false
        isEnabled = false
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        collisionMode = .rectangle
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    private func show() {
        guard let mark = annotation as? SpecialUseTabAnnotation else { return }
        box.layer.borderColor = (mark.area.restricted ? WingtipColor.Chart.specialUse : WingtipColor.Chart.airspaceMagenta).cgColor
        label.text = mark.text
        label.sizeToFit()
        box.transform = .identity
        let size = CGSize(width: label.bounds.width + 12, height: label.bounds.height + 4)
        box.bounds = CGRect(origin: .zero, size: size)
        label.frame.origin = CGPoint(x: 6, y: 2)
        displayPriority = MKFeatureDisplayPriority(rawValue: mark.area.restricted ? 200 : 190)
        accessibilityLabel = "\(mark.area.name), \(mark.limits.floor) to \(mark.limits.ceiling)"
        turn()
    }

    /// Turned again as the map turns: the box along its side, set off the
    /// line towards the area, in a square round it so MapKit's collision
    /// keeps room for it at any turn.
    func turn() {
        guard let mark = annotation as? SpecialUseTabAnnotation else { return }
        let (angle, side) = SpecialUseTab.turn(angle: mark.tab.angle, side: mark.tab.side, heading: Self.heading)
        let a = CGFloat(angle * .pi / 180)
        box.transform = CGAffineTransform(rotationAngle: a)
        let size = box.bounds.size
        let edge = hypot(size.width, size.height)
        frame.size = CGSize(width: edge, height: edge)
        box.center = CGPoint(x: edge / 2, y: edge / 2)
        // The text's "down", turned with it: (0, 1) turned clockwise by a.
        let off = SpecialUseTab.inside * CGFloat(side)
        centerOffset = CGPoint(x: -sin(a) * off, y: cos(a) * off)
    }
}
