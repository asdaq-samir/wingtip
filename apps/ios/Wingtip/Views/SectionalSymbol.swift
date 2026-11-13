import UIKit

/// The sectional's airport symbol (FAA Aeronautical Chart User's Guide,
/// VFR Terms and Symbols, Airports: blue for a field with a control
/// tower, magenta for every other) as ForeFlight draws it and the web map
/// (sectionalAirportSvg, the owner's screenshot over Madison,
/// 2026-11-08): a ring in the field's ink round a white disc with a dot
/// of the ink in its middle, inside a white halo, sized by the field; a
/// private field (NASR FACILITY_USE_CODE PR) the guide's circle with an
/// R, a military one with an M. The field's flight category, where it
/// reports one, is a ring round the symbol in the category's colour (the
/// halo, the owner's pick of 2026-11-10), 4.5 points wide so it holds in
/// sunlight. Drawn once for each look and kept.
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

    /// The halo's stroke, points: wide enough to read in sunlight (the spec's 4.5).
    static let haloWidth: CGFloat = 4.5
    /// The image's side, wider than the mark's box so the halo fits round
    /// the biggest symbol: the view's frame, which MapKit collides, keeps
    /// the box.
    static let side: CGFloat = 34

    /// The radius the symbol and its halo reach, for what is drawn round it.
    static func reach(kind: String, use: String?, halo: Bool) -> CGFloat {
        let r: CGFloat = use == nil ? radius(kind) : 7
        return r + 2.5 + (halo ? haloWidth : 0)
    }

    @MainActor
    static func image(towered: Bool?, kind: String, use: String?, category: String?, style: AirportWeatherStyle = .halo) -> UIImage {
        // A category is drawn only where the field reports one and the
        // pilot wants it drawn; no report keeps the chart's own symbol.
        let category = style == .off ? nil : category
        let key = "\(towered.map { $0 ? "t" : "u" } ?? "-")|\(kind)|\(use ?? "")|\(category ?? "")|\(style.rawValue)"
        if let kept = drawn[key] { return kept }
        let ink = SectionalInk.airport(towered: towered)
        let colour = category.map { FlightCategory.mark($0) }
        let box = side
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
            if let colour {
                // The category's ring just outside the white, the symbol
                // keeping its towered blue or magenta inside it.
                cg.setStrokeColor(colour.cgColor)
                cg.setLineWidth(haloWidth)
                cg.strokeEllipse(in: circle(middle, r + 2.5 + haloWidth / 2))
            }
        }
        drawn[key] = image
        return image
    }
}
