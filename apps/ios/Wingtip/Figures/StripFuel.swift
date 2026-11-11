import Foundation

/// The figures strip's fuel, the engine's `strip_fuel` for the three apps:
/// the fuel required, less what a flight under way has burnt, and where
/// the tanks do not hold it and its reserve (14 CFR 91.151, 91.167).
typealias StripFuel = EngineContract.StripFuelAnswer

extension StripFuel {
    /// From the planner's totals: required, less `burntGal`, and where
    /// short; thrown where the engine cannot answer (the strip then shows
    /// the fuel unknown, in the warning's colour, never as enough).
    static func of(_ totals: Totals?, burntGal: Double? = nil) throws -> StripFuel {
        try Engine.stripFuel(fuelRequiredGal: totals?.fuelRequiredGal, fuelMarginGal: totals?.fuelMarginGal, burntGal: burntGal)
    }
}
