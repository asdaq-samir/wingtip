import UIKit

/// A field's weather as its mark draws it, every figure already the
/// report's or the engine's (FieldWeatherMarks): the category, the wind
/// as reported, its barb, whether the barb is drawn zoomed out and is
/// red, the station model's two lines and whether the ↓ shows. Nothing
/// here is worked out.
struct FieldWeatherMark: Equatable, Sendable {
    var category: String?
    /// The wind as the METAR has it: from, true degrees (nil variable),
    /// its speed and gust.
    var windFromDeg: Double?
    var windKt: Double?
    var gustKt: Double?
    /// Calm, the engine's wind_barb's own answer (under 3 kt).
    var calm = false
    /// The barb's flags (50 kt), barbs (10) and half-barbs (5), the
    /// engine's wind_barb; nil with no wind to draw.
    var feathers: Feathers?
    /// The barb drawn zoomed out too, where the wind earns one, and red
    /// past the picked airplane's demonstrated crosswind (the engine's
    /// wind_arrow: 10 kt or more, or gusting).
    var far = false
    var over = false
    /// "VRB05": a variable wind, which no barb can point, written beside
    /// the field where its barb would be.
    var variable: String?
    /// The station model's lines: "2 SM BR" and "OVC 008".
    var visibilityLine: String?
    var ceilingLine: String?
    /// The TAF worse by the pilot's time there (weather_worse).
    var worse = false
    /// What VoiceOver says after the ident: "IFR, wind 220 at 18 gusting 26".
    var spoken: String
    /// How old the report is where it is stale ("1h 15m"): heard over
    /// FieldWeatherMarks.staleAfterS ago, its halo greyed and the age by
    /// the ident; nil while fresh.
    var heardAgo: String? = nil
}

/// A wind barb's parts as the engine's wind_barb gives them.
struct Feathers: Equatable, Sendable {
    var flags = 0, barbs = 0, halfBarbs = 0
}

/// The station model close in (the "Recommended" artboard): a wind barb
/// from the side the wind is from, its flags, barbs and half-barbs the
/// engine's (wind_barb, FAA-H-8083-28B 25.2.3.4.5), a ring for calm, and
/// the visibility and ceiling as two short lines beside the field.
enum StationModel {
    /// The staff's length from the field's middle, points.
    static let staff: CGFloat = 26

    /// The barb as a path round `middle`, the staff out toward the side
    /// the wind is from (`fromDeg` on the screen: true minus the map's
    /// heading), its barbs on the staff's clockwise side, as plotted in
    /// the northern hemisphere; starting `inset` out from the middle so it
    /// clears the symbol, its staff and feathers drawn at `scale` (FarBarb).
    static func barb(fromDeg: Double, feathers: Feathers, middle: CGPoint, inset: CGFloat, scale: CGFloat = 1) -> UIBezierPath {
        let a = fromDeg * .pi / 180
        // Screen axes: up is -y.
        let out = CGVector(dx: sin(a), dy: -cos(a))
        let side = CGVector(dx: -out.dy, dy: out.dx)
        func at(_ d: CGFloat, _ s: CGFloat = 0) -> CGPoint {
            CGPoint(x: middle.x + out.dx * d + side.dx * s, y: middle.y + out.dy * d + side.dy * s)
        }
        let end = inset + staff * scale
        let path = UIBezierPath()
        path.move(to: at(inset))
        path.addLine(to: at(end))
        let (pennants, full, half) = (feathers.flags, feathers.barbs, feathers.halfBarbs)
        let step: CGFloat = 4.5 * scale, length: CGFloat = 10 * scale
        var d = end
        for _ in 0..<pennants {
            path.move(to: at(d))
            path.addLine(to: at(d + 2 * scale, length))
            path.addLine(to: at(d - step))
            path.close()
            d -= step + 1.5 * scale
        }
        for _ in 0..<full {
            path.move(to: at(d))
            path.addLine(to: at(d + 2 * scale, length))
            d -= step
        }
        if half == 1 {
            // A lone half barb sits a step in from the staff's end, so it
            // is not read as a full one.
            if pennants == 0 && full == 0 { d -= step }
            path.move(to: at(d))
            path.addLine(to: at(d + scale, length / 2))
        }
        return path
    }
}

/// The barb farther out than the station model is drawn (the web's
/// AirportWeatherGl FAR): only where the engine's wind_arrow says the wind
/// earns one, none out past a region's scale, smaller there and growing
/// in, so a country of light winds doesn't bury the chart (the owner's
/// iPhone at zoom 3, 2026-11-12).
enum FarBarb {
    /// From the app's zoom 6, a sectional region's scale, at 0.6 of its
    /// size, whole by 9.
    static let from = 6.0
    static let whole = 9.0
    static let smallest: CGFloat = 0.6

    /// The barb's size at `zoom`, in tenths so the marks are drawn again
    /// only a few times across the pinch; nil below `from`.
    static func scale(zoom: Double) -> CGFloat? {
        guard zoom >= from else { return nil }
        let share = min(1, (zoom - from) / (whole - from))
        return ((smallest + (1 - smallest) * CGFloat(share)) * 10).rounded() / 10
    }
}

/// The weather drawn round a field's mark: the barb (the station model's
/// close in, the far one where the wind earns it), a ring for calm,
/// "VRB05" for a variable wind, the station model's lines and the ↓
/// badge. Brand tokens only; each stroke cased in the chart's white so it
/// reads on any part of it.
final class FieldWeatherLayer: CALayer {
    private let barb = CAShapeLayer()
    private let barbCase = CAShapeLayer()
    private let variable = CATextLayer()
    private let lines = CATextLayer()
    private let badge = CALayer()
    private let chevron = CAShapeLayer()

    override init() {
        super.init()
        barbCase.strokeColor = WingtipColor.Chart.casing.cgColor
        barbCase.lineWidth = 4.5
        barb.lineWidth = 2
        for stroke in [barbCase, barb] {
            stroke.lineCap = .round
            stroke.lineJoin = .round
            addSublayer(stroke)
        }
        for text in [variable, lines] {
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
    /// lines starting at `linesAt` under the ident; `station` the station
    /// model's barb and lines, every wind, else the far barb at `far`'s
    /// size where the wind earns one (nil, none); `heading` the map's.
    /// Gives back the far barb's box, or its "VRB05"'s, for the mark to
    /// make room for (AirportMarkView): far out the barbs give way to one
    /// another; close in, as the web's station model, they overlap.
    @discardableResult
    func show(_ mark: FieldWeatherMark?, choice: AirportWeatherChoice, station: Bool, far: CGFloat?, heading: Double,
              middle: CGPoint, symbolRadius: CGFloat, linesAt: CGPoint) -> CGRect? {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let on = choice.style != .off
        let ink = mark?.over == true ? WingtipColor.Chart.warning : WingtipColor.Chart.tag
        // The barb at its size: the station model's whole, else the far
        // one's where the wind earns it and the switch is on.
        let scale: CGFloat? = !on || mark == nil ? nil : station ? 1 : choice.windBarbs && mark?.far == true ? far : nil
        var barbPath: CGPath?
        var room: CGRect?
        if let scale, let mark {
            if mark.calm {
                // Calm a ring round the field, the station model's alone:
                // calm never earns a far barb.
                let r = symbolRadius + 6
                barbPath = UIBezierPath(ovalIn: CGRect(x: middle.x - r, y: middle.y - r, width: 2 * r, height: 2 * r)).cgPath
            } else if let from = mark.windFromDeg, let feathers = mark.feathers {
                let path = StationModel.barb(fromDeg: from - heading, feathers: feathers, middle: middle, inset: symbolRadius + 4, scale: scale)
                barbPath = path.cgPath
                if !station { room = path.bounds.insetBy(dx: -3, dy: -3) }
            }
        }
        barb.path = barbPath
        barbCase.path = barbPath
        barb.strokeColor = ink.cgColor
        barb.fillColor = ink.cgColor
        barbCase.fillColor = WingtipColor.Chart.casing.cgColor
        // A variable wind where its barb would be: to the field's left,
        // its ident being to the right.
        let vrb = scale == nil ? nil : mark?.variable
        variable.isHidden = vrb == nil
        if let vrb {
            let string = Self.cased(vrb, colour: ink)
            variable.string = string
            let size = string.size()
            variable.frame = CGRect(x: middle.x - symbolRadius - 3 - ceil(size.width), y: middle.y - ceil(size.height) / 2,
                                    width: ceil(size.width) + 2, height: ceil(size.height))
            if !station { room = variable.frame.insetBy(dx: -2, dy: -2) }
        }
        let text = on && station ? [mark?.visibilityLine, mark?.ceilingLine].compactMap { $0 }.joined(separator: "\n") : ""
        lines.isHidden = text.isEmpty
        if !text.isEmpty {
            lines.string = Self.cased(text)
            let size = (lines.string as? NSAttributedString)?.boundingRect(with: CGSize(width: 120, height: 60), options: .usesLineFragmentOrigin, context: nil).size ?? .zero
            lines.frame = CGRect(origin: linesAt, size: CGSize(width: ceil(size.width) + 2, height: ceil(size.height)))
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
        return room
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
