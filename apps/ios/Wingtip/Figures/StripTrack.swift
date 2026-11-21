import Foundation

/// The strip's track and GPS height, as the web's trackFigure and
/// gpsFigure give them.
@MainActor
enum StripTrack {
    /// The airplane's track over the ground in degrees magnetic, as a
    /// pilot flies and ATC assigns headings by the compass: the engine's
    /// own on the route (`in_flight`'s track_mag_deg), else the fix's true
    /// course less the engine's WMM variation there (`magnetic_variation`;
    /// "east is least", FAA-H-8083-25C, ch. 16). None with no fix, no
    /// course in it (a GPS gives none while stationary), or below flying
    /// speed (the engine's `underway`): a course at a walk is noise.
    static func of(_ fix: OwnShip.Fix?, underway: Bool, magneticDeg: Double?) -> Double? {
        guard let fix, underway, let trueDeg = fix.trackDeg, trueDeg.isFinite else { return nil }
        if let magneticDeg { return magneticDeg }
        let variation = try? Engine.magneticVariation(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude)
        return Emergency.magnetic(trueDeg, variationDeg: variation)
    }

    /// The GPS's height to the nearest 10 ft, no finer than a GPS gives
    /// it: Core Location's altitude over mean sea level by its geoid model
    /// (OwnShip), never the altimeter's, which is set to the local
    /// pressure (14 CFR 91.121).
    static func tens(_ feet: Double) -> Double { (feet / 10).rounded() * 10 }
}
