import UIKit

/// A field's weather as its mark draws it, every figure already the
/// report's or the engine's (FieldWeatherMarks): the category, the wind
/// as reported, whether the arrow shows and is red, the station model's
/// two lines and whether the ↓ shows. Nothing here is worked out.
struct FieldWeatherMark: Equatable, Sendable {
    var category: String?
    /// The wind as the METAR has it: from, true degrees (nil variable),
    /// its speed and gust.
    var windFromDeg: Double?
    var windKt: Double?
    var gustKt: Double?
    /// The engine's calm (wind_calm, AIM 7-1-28).
    var calm = false
    /// The barb's flags (50 kt), barbs (10) and half-barbs (5), the
    /// engine's wind_barb; nil with no wind to draw.
    var feathers: Feathers?
    /// The arrow shown at every zoom, and red (the engine's wind_arrow).
    var arrow = false
    var arrowRed = false
    /// "18G26", beside the arrow.
    var windLabel: String?
    /// The station model's lines: "2 SM BR" and "OVC 008".
    var visibilityLine: String?
    var ceilingLine: String?
    /// The TAF worse by the pilot's time there (weather_worse).
    var worse = false
    /// What VoiceOver says after the ident: "IFR, wind 220 at 18 gusting 26".
    var spoken: String
}

/// A wind barb's parts as the engine's wind_barb gives them.
struct Feathers: Equatable, Sendable {
    var flags = 0, barbs = 0, halfBarbs = 0
}

/// The station model close in (the "Recommended" artboard): a wind barb
/// from the side the wind is from, its flags, barbs and half-barbs the
/// engine's (wind_barb, FAA-H-8083-28A 25.2.3.4.5), a ring for calm, and
/// the visibility and ceiling as two short lines beside the field.
enum StationModel {
    /// The web map's zoom from which its lines fit beside each field (the
    /// web and Android draw it from 10).
    static let fromZoom = 10.0
    /// The staff's length from the field's middle, points.
    static let staff: CGFloat = 26

    /// The barb as a path round `middle`, the staff out toward the side
    /// the wind is from (`fromDeg` on the screen: true minus the map's
    /// heading), its barbs on the staff's clockwise side, as plotted in
    /// the northern hemisphere; starting `inset` out from the middle so it
    /// clears the symbol.
    static func barb(fromDeg: Double, feathers: Feathers, middle: CGPoint, inset: CGFloat) -> UIBezierPath {
        let a = fromDeg * .pi / 180
        // Screen axes: up is -y.
        let out = CGVector(dx: sin(a), dy: -cos(a))
        let side = CGVector(dx: -out.dy, dy: out.dx)
        func at(_ d: CGFloat, _ s: CGFloat = 0) -> CGPoint {
            CGPoint(x: middle.x + out.dx * d + side.dx * s, y: middle.y + out.dy * d + side.dy * s)
        }
        let end = inset + staff
        let path = UIBezierPath()
        path.move(to: at(inset))
        path.addLine(to: at(end))
        let (pennants, full, half) = (feathers.flags, feathers.barbs, feathers.halfBarbs)
        let step: CGFloat = 4.5, length: CGFloat = 10
        var d = end
        for _ in 0..<pennants {
            path.move(to: at(d))
            path.addLine(to: at(d + 2, length))
            path.addLine(to: at(d - step))
            path.close()
            d -= step + 1.5
        }
        for _ in 0..<full {
            path.move(to: at(d))
            path.addLine(to: at(d + 2, length))
            d -= step
        }
        if half == 1 {
            // A lone half barb sits a step in from the staff's end, so it
            // is not read as a full one.
            if pennants == 0 && full == 0 { d -= step }
            path.move(to: at(d))
            path.addLine(to: at(d + 1, length / 2))
        }
        return path
    }
}

/// The weather drawn round a field's mark, outside its frame so it does
/// not change what MapKit collides: the station model's barb and lines,
/// the wind arrow and its words, the ↓ badge. Brand tokens only; each
/// stroke cased in the chart's white so it reads on any part of it.
final class FieldWeatherLayer: CALayer {
    private let barb = CAShapeLayer()
    private let barbCase = CAShapeLayer()
    private let arrow = CAShapeLayer()
    private let arrowCase = CAShapeLayer()
    private let words = CATextLayer()
    private let lines = CATextLayer()
    private let badge = CALayer()
    private let chevron = CAShapeLayer()

    override init() {
        super.init()
        for (casing, ink) in [(barbCase, barb), (arrowCase, arrow)] {
            casing.strokeColor = WingtipColor.Chart.casing.cgColor
            casing.lineWidth = 4.5
            casing.lineCap = .round
            casing.lineJoin = .round
            ink.lineWidth = 2
            ink.lineCap = .round
            ink.lineJoin = .round
            addSublayer(casing)
            addSublayer(ink)
        }
        for text in [words, lines] {
            // Sharp at every phone's scale (UIScreen.main is deprecated;
            // the view sets its own on the layer it is drawn in).
            text.contentsScale = 3
            text.fontSize = 11
            text.font = UIFont.systemFont(ofSize: 11, weight: .bold)
            addSublayer(text)
        }
        lines.isWrapped = true
        badge.backgroundColor = WingtipColor.Chart.caution.cgColor
        badge.borderColor = WingtipColor.Chart.casing.cgColor
        badge.borderWidth = 1.5
        badge.cornerRadius = 7
        chevron.strokeColor = WingtipColor.Chart.tag.cgColor
        chevron.fillColor = nil
        chevron.lineWidth = 2
        chevron.lineCap = .round
        chevron.lineJoin = .round
        badge.addSublayer(chevron)
        addSublayer(badge)
    }

    override init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Draws `mark` round `middle` (the symbol's middle in the view), its
    /// lines starting at `linesAt` under the ident; `station` the barb and
    /// lines in place of the arrow, `heading` the map's.
    func show(_ mark: FieldWeatherMark?, choice: AirportWeatherChoice, station: Bool, heading: Double,
              middle: CGPoint, symbolRadius: CGFloat, linesAt: CGPoint) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let on = choice.style != .off
        let ink = (mark?.arrowRed == true ? WingtipColor.Chart.warning : WingtipColor.Chart.tag).cgColor
        // The barb, or a ring for calm, and the two lines.
        var barbPath: CGPath?
        if on, station, let mark {
            if mark.calm {
                let r = symbolRadius + 6
                barbPath = UIBezierPath(ovalIn: CGRect(x: middle.x - r, y: middle.y - r, width: 2 * r, height: 2 * r)).cgPath
            } else if let from = mark.windFromDeg, let feathers = mark.feathers {
                barbPath = StationModel.barb(fromDeg: from - heading, feathers: feathers, middle: middle, inset: symbolRadius + 4).cgPath
            }
        }
        barb.path = barbPath
        barbCase.path = barbPath
        barb.strokeColor = ink
        barb.fillColor = ink
        barbCase.fillColor = WingtipColor.Chart.casing.cgColor
        let text = on && station ? [mark?.visibilityLine, mark?.ceilingLine].compactMap { $0 }.joined(separator: "\n") : ""
        lines.isHidden = text.isEmpty
        if !text.isEmpty {
            lines.string = Self.cased(text)
            let size = (lines.string as? NSAttributedString)?.boundingRect(with: CGSize(width: 120, height: 60), options: .usesLineFragmentOrigin, context: nil).size ?? .zero
            lines.frame = CGRect(origin: linesAt, size: CGSize(width: ceil(size.width) + 2, height: ceil(size.height)))
        }
        // The arrow, where the wind blows, with its words; the barb says
        // the same close in.
        var arrowPath: CGPath?
        let showArrow = on && choice.windArrows && !station && mark?.arrow == true
        if showArrow, let mark, let from = mark.windFromDeg {
            arrowPath = Self.arrow(toDeg: from + 180 - heading, middle: middle, inset: symbolRadius + 4)
        }
        arrow.path = arrowPath
        arrowCase.path = arrowPath
        arrow.strokeColor = ink
        arrow.fillColor = ink
        arrowCase.fillColor = WingtipColor.Chart.casing.cgColor
        words.isHidden = arrowPath == nil || mark?.windLabel == nil
        if !words.isHidden, let label = mark?.windLabel {
            let string = Self.cased(label, colour: mark?.arrowRed == true ? WingtipColor.Chart.warning : WingtipColor.Chart.tag)
            words.string = string
            let size = string.size()
            // Beside the arrow's head, on its side away from the ident.
            words.frame = CGRect(x: middle.x - size.width - symbolRadius - 6, y: middle.y - symbolRadius - size.height - 2,
                                 width: ceil(size.width) + 2, height: ceil(size.height))
        }
        // The ↓ at the symbol's upper right.
        badge.isHidden = !(on && choice.worse && mark?.worse == true)
        if !badge.isHidden {
            badge.frame = CGRect(x: middle.x + symbolRadius - 3, y: middle.y - symbolRadius - 11, width: 14, height: 14)
            let v = UIBezierPath()
            v.move(to: CGPoint(x: 3.5, y: 5.5))
            v.addLine(to: CGPoint(x: 7, y: 9))
            v.addLine(to: CGPoint(x: 10.5, y: 5.5))
            chevron.path = v.cgPath
        }
    }

    /// An arrow from `inset` out of the middle, pointing where the wind
    /// blows (`toDeg` on the screen).
    static func arrow(toDeg: Double, middle: CGPoint, inset: CGFloat) -> CGPath {
        let a = toDeg * .pi / 180
        let out = CGVector(dx: sin(a), dy: -cos(a))
        let side = CGVector(dx: -out.dy, dy: out.dx)
        func at(_ d: CGFloat, _ s: CGFloat = 0) -> CGPoint {
            CGPoint(x: middle.x + out.dx * d + side.dx * s, y: middle.y + out.dy * d + side.dy * s)
        }
        // Upwind of the field the tail, downwind the head: the arrow
        // crosses the field as the wind does.
        let tail = -(inset + 14), head = -inset
        let path = UIBezierPath()
        path.move(to: at(tail))
        path.addLine(to: at(head - 4))
        path.move(to: at(head))
        path.addLine(to: at(head - 7, 4.5))
        path.addLine(to: at(head - 7, -4.5))
        path.close()
        return path.cgPath
    }

    /// Words in their ink on the chart's white halo, as the ident's.
    static func cased(_ text: String, colour: UIColor = WingtipColor.Chart.tag) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: 11, weight: .bold),
            .foregroundColor: colour,
            .strokeColor: WingtipColor.Chart.casing,
            .strokeWidth: -3,
        ])
    }
}
