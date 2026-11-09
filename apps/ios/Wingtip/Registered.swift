import Foundation

/// An airplane by its N-number, as the web app picks one
/// (lib/aircraftChoice): the FAA's registry says its make, model and year,
/// and the type's planner profile is the one whose handbook figures it
/// flies on -- the Cherokee 140 by its year, the 1970 "D" (14,300 ft) from
/// the 1973-on Cruiser (10,950 ft), from the owner's own handbook page.
enum Registered {
    /// 14 CFR 47.15(b)'s shape for an N-number: N, then up to five
    /// figures, four and a letter, or three and two letters, the first
    /// figure 1 to 9 and never the letters I or O -- the engine's
    /// `n_number`, the web app's N_NUMBER; thrown where it cannot answer.
    static func isNNumber(_ s: String) throws -> Bool {
        try Engine.nNumber(text: s)
    }

    /// The planner profile for a registered airplane, or nil where the
    /// planner has no figures for its type: the engine's
    /// `registered_profile` (engine/crates/pilot/src/aircraft/registry.rs), the
    /// web app's profileOfRegistered.
    static func profile(manufacturer: String?, model: String?, year: Int?) throws -> String? {
        try Engine.registeredProfile(manufacturer: manufacturer, model: model, year: year.map(Double.init))
    }
}

/// The FAA registry's record (AircraftRegistration), generated.
typealias AircraftRegistration = APIAircraftRegistration
