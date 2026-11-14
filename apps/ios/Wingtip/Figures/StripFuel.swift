import Foundation

/// The figures strip's fuel, the engine's `strip_fuel` for the three apps:
/// the fuel required, less what a flight under way has burnt, and where
/// the tanks do not hold it and its reserve (14 CFR 91.151, 91.167).
typealias StripFuel = EngineContract.StripFuelAnswer

extension StripFuel {
    /// From the planner's totals: required to the landing of hop `hop`
    /// (the tanks filled at each stop, the planner's `hops`), less
    /// `burntGal`, and the flights the tanks fall short on. A route with
    /// stops has no route-wide figure, so its hops are sent, as the web
    /// sends them (AV-3); without them the strip lost the fuel check on any
    /// route with a stop. Thrown where the engine cannot answer (the strip
    /// then shows the fuel unknown, in the warning's colour, never as
    /// enough).
    static func of(_ totals: Totals?, hop: Int = 0, burntGal: Double? = nil) throws -> StripFuel {
        let hops = (totals?.hops ?? []).map {
            EngineContract.StripFuelInputHopsItem(departure: $0.departure, destination: $0.destination,
                                                  fuelRequiredGal: $0.totals.fuelRequiredGal, fuelMarginGal: $0.totals.fuelMarginGal)
        }
        return try Engine.stripFuel(fuelRequiredGal: totals?.fuelRequiredGal, fuelMarginGal: totals?.fuelMarginGal,
                                    hops: hops.isEmpty ? nil : hops, hop: hop, burntGal: burntGal)
    }

    /// The flights the tanks fall short on, each named by its two ends as
    /// the route names them (a pilot's own point by its name, not the
    /// "@lat,lon" the engine's `name` carries; CODE-13), "Short 3.2 gal
    /// from C81 to KMSN"; the whole route's "Short 3.2 gal" with no stops.
    func shortWords(_ course: Course?) -> [String] {
        let ends = course.map { [$0.departure] + ($0.stops ?? []) + [$0.destination] } ?? []
        func name(_ end: APIAirportEnd) -> String { end.ident.hasPrefix("@") ? end.name : end.ident }
        return short.map { item in
            let gallons = "Short \(Format.fuel(item.shortGal))"
            guard let hop = item.hop, hop + 1 < ends.count else { return item.name.isEmpty ? gallons : "\(gallons) on \(item.name)" }
            return "\(gallons) from \(name(ends[hop])) to \(name(ends[hop + 1]))"
        }
    }
}
