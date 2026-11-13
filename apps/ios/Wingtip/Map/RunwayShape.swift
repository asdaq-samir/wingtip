import Foundation

/// A field's runways as the map draws them, from its card's answer.
struct RunwayShape: Equatable, Sendable {
    struct End: Equatable, Sendable { let ident: String; let lat: Double; let lon: Double; let headingTrueDeg: Double? }
    let a: End
    let b: End
    let widthFt: Double?
    /// Turf, grass, dirt or gravel by its surface (the planner's field,
    /// OurAirports' or NASR's code), as the engine reads it for the
    /// short-field figures (gonogo_soft_surface); nil where the engine
    /// cannot class it, drawn as unknown rather than as paved.
    var soft: Bool? = false

    /// The runways with both ends placed; a helipad (no heading) or a
    /// runway with an end the data does not place is not drawn.
    static func of(_ runways: [Runway]) -> [RunwayShape] {
        runways.compactMap { runway in
            let ends = (runway.runwayEnds ?? []).compactMap { end -> End? in
                guard let lat = end.lat, let lon = end.lon, end.headingTrueDeg != nil else { return nil }
                return End(ident: end.ident, lat: lat, lon: lon, headingTrueDeg: end.headingTrueDeg)
            }
            guard ends.count == 2 else { return nil }
            // A surface the engine cannot class (logged by Engine.rule) is
            // unknown, never drawn as paved; the card says the surface.
            let soft = try? Engine.gonogoSoftSurface(surface: runway.surface)
            return RunwayShape(a: ends[0], b: ends[1], widthFt: runway.widthFt.map(Double.init), soft: soft)
        }
    }
}
