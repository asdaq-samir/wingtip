import CoreGraphics

/// The airport card's runway sketch laid out by the engine
/// (runway_sketch: between NASR's surveyed runway ends, APT_RWY_END, else
/// guessed along a runway's true heading through the field's point), the
/// web's RunwaySketch the same, so a field is drawn alike on both. The
/// view draws it (RunwaySketch); this asks it.
nonisolated enum RunwaySketchLayout {
    typealias Strip = (ends: [String], a: CGPoint, b: CGPoint)

    /// The engine's strips as pairs of points, nautical miles east and
    /// south (the screen's y down) of the field; none where it lays none.
    static func strips(_ runways: [Runway], lat: Double, lon: Double) -> [Strip] {
        let asked = runways.map { r in
            EngineContract.RunwaySketchInputRunwaysItem(
                runwayEnds: r.runwayEnds?.map { .init(ident: $0.ident, lat: $0.lat, lon: $0.lon, headingTrueDeg: $0.headingTrueDeg) },
                lengthFt: r.lengthFt.map(Double.init), widthFt: r.widthFt.map(Double.init))
        }
        guard !asked.isEmpty, let sketch = try? Engine.runwaySketch(lat: lat, lon: lon, runways: asked) else { return [] }
        return sketch.strips.compactMap { strip in
            guard let ends = runways[safe: strip.runway]?.runwayEnds, ends.count >= 2, strip.a.count == 2, strip.b.count == 2 else { return nil }
            return ([ends[0].ident, ends[1].ident], CGPoint(x: strip.a[0], y: -strip.a[1]), CGPoint(x: strip.b[0], y: -strip.b[1]))
        }
    }
}
