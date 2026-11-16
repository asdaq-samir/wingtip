import UIKit

/// A field's mark on the chart, the planner's own mark (the owner's pick of
/// 2026-11-14, option I of the canvas V1d9RDbmY1aczc4LfXed7a), drawn as the
/// web's airportMarkSvg draws it, where the iPhone drew the sectional's
/// symbol in a weather halo. Its ring is the class of airspace at the
/// field's surface in the sectional's own code (FAA Aeronautical Chart
/// User's Guide, Airspace): Class B and D blue, C and E magenta, D and E
/// dashed as their boundaries are, B's ring the thickest and C's next, G
/// the magenta thin and faded, no class known the chart's grey; four ticks
/// round it, white inside it, and the field's flight category the large
/// disc in its middle (AIM 7-1-7's colours), grey with no report or with
/// Airport Weather Off. A private or military field is the guide's disc
/// with its R or M and the weather a small dot at its corner. Sized by the
/// engine's step for the field (field_mark_rank's `size`).
enum FieldMark {
    /// The mark's side at the regular step, points (the web's AIRPORT_MARK).
    static let side: CGFloat = 26

    /// How much larger each of the engine's size steps is drawn: the web's
    /// 1.5, 1.2, 1 and 0.82 (the canvas's low ends, so O'Hare's mark does
    /// not take Midway's place at a region's zoom).
    static func step(_ size: String?) -> CGFloat {
        switch size {
        case "largest": 1.5
        case "larger": 1.2
        case "small": 0.82
        default: 1
        }
    }

    /// The mark's size at a zoom (Leaflet's level, MapExtras.zoom), as the
    /// web map's icon-size: 0.7 a few states across, 1 at 10, 1.25 from 13.
    static func scale(zoom: Double) -> CGFloat {
        if zoom <= 4 { return 0.7 }
        if zoom <= 10 { return CGFloat(0.7 + 0.3 * (zoom - 4) / 6) }
        if zoom <= 13 { return CGFloat(1 + 0.25 * (zoom - 10) / 3) }
        return 1.25
    }

    /// The radius the mark reaches at a step, for what is drawn round it
    /// (the barb and the station model's lines).
    static func reach(step: CGFloat) -> CGFloat { side / 2 * step }

    @MainActor private static var drawn: [String: UIImage] = [:]

    /// The mark's picture at a step: `space` the surface's class (B, C, D,
    /// E, G or nil), `category` the flight category to fill it with (nil
    /// grey), `use` "military", "private" or nil. Each is drawn once and
    /// kept; drawn at the screen's scale, so the largest step stays sharp.
    @MainActor
    static func image(space: String?, category: String?, use: String?, step: CGFloat) -> UIImage {
        let key = "\(space ?? "")|\(category ?? "")|\(use ?? "")|\(step)"
        if let kept = drawn[key] { return kept }
        let box = side * step
        let blue = space == "B" || space == "D"
        let ink = space == nil ? SectionalInk.unknown : blue ? SectionalInk.blue : SectionalInk.magenta
        let casing = WingtipColor.Chart.casing
        // No report, a stale one or the setting Off: the no-report grey.
        let weather = FlightCategory.mark(category)
        let image = UIGraphicsImageRenderer(size: CGSize(width: box, height: box)).image { context in
            let cg = context.cgContext
            // Drawn in the web's 26-point frame round the middle, scaled.
            cg.translateBy(x: box / 2, y: box / 2)
            cg.scaleBy(x: step, y: step)
            func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> CGRect { CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r) }
            cg.setLineCap(.round)
            if let use {
                cg.setFillColor((use == "military" ? SectionalInk.blue : SectionalInk.magenta).cgColor)
                cg.setStrokeColor(casing.cgColor)
                cg.setLineWidth(2)
                cg.addEllipse(in: circle(0, 0, 10))
                cg.drawPath(using: .fillStroke)
                let letter = NSAttributedString(string: use == "military" ? "M" : "R", attributes: [
                    .font: UIFont.systemFont(ofSize: 11, weight: .heavy), .foregroundColor: casing,
                ])
                let size = letter.size()
                letter.draw(at: CGPoint(x: -size.width / 2, y: -size.height / 2))
                cg.setFillColor(weather.cgColor)
                cg.setLineWidth(1.4)
                cg.addEllipse(in: circle(7.5, 7.5, 4.6))
                cg.drawPath(using: .fillStroke)
                return
            }
            let ticks = UIBezierPath()
            for (from, to) in [((0.0, -9.0), (0.0, -12.2)), ((9.0, 0.0), (12.2, 0.0)), ((0.0, 9.0), (0.0, 12.2)), ((-9.0, 0.0), (-12.2, 0.0))] {
                ticks.move(to: CGPoint(x: from.0, y: from.1))
                ticks.addLine(to: CGPoint(x: to.0, y: to.1))
            }
            // The white casing round the ticks and the ring.
            cg.setStrokeColor(casing.cgColor)
            cg.setLineWidth(5.5)
            cg.addPath(ticks.cgPath)
            cg.strokePath()
            cg.setFillColor(casing.cgColor)
            cg.addEllipse(in: circle(0, 0, 8.5))
            cg.drawPath(using: .fillStroke)
            let faded = space == "G" ? ink.withAlphaComponent(0.45) : ink
            cg.setStrokeColor(faded.cgColor)
            cg.setLineWidth(2.5)
            cg.addPath(ticks.cgPath)
            cg.strokePath()
            let thin = space == "G" || space == nil
            cg.setLineWidth(space == "B" ? 3.2 : space == "C" ? 2.8 : thin ? 1.6 : 2.2)
            if space == "D" || space == "E" { cg.setLineDash(phase: 0, lengths: [3.4, 2.1]) }
            cg.strokeEllipse(in: circle(0, 0, 8.5))
            cg.setLineDash(phase: 0, lengths: [])
            cg.setFillColor(weather.cgColor)
            cg.fillEllipse(in: circle(0, 0, 6))
        }
        drawn[key] = image
        return image
    }
}
