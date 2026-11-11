import Foundation

/// A field's density altitude from its report, the engine's: the pressure
/// altitude from the elevation and the altimeter setting
/// (`pressure_altitude_ft`), the air's density ratio at the reported
/// temperature (`density_ratio`) and the altitude of that density in the
/// standard atmosphere (`density_altitude_ft`; FAA-H-8083-25C ch. 4).
enum FieldDensity {
    /// Nil without an elevation, an altimeter setting or a temperature;
    /// a failure where the engine cannot work it out, said where it shows.
    static func altitudeFt(elevationFt: Double?, altimeterInHg: Double?, tempC: Double?) -> Result<Double, any Error>? {
        guard let elevationFt, let altimeterInHg, let tempC else { return nil }
        return Result {
            let pressure = try Engine.pressureAltitudeFt(elevationFt: elevationFt, altimeterInhg: altimeterInHg)
            return try Engine.densityAltitudeFt(sigma: try Engine.densityRatio(altitudeFt: pressure, oatC: tempC))
        }
    }
}
