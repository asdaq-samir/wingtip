import Foundation

/// One of an airplane's figures a pilot may give: the engine's
/// airplane_figures keys (engine/crates/pilot/src/aircraft/figures.rs),
/// which are the gateway record's and the planner's query's in snake case.
/// Each is its own handbook's: the cruise, burn, power and usable fuel
/// from its Section 5 and Section 2, the climb from Section 5's climb
/// chart, the glide from Section 3 (the POH format of GAMA Specification
/// No. 1), the empty weight and moment from its own weight and balance
/// record (FAA-H-8083-1B). None is ever another airplane's (the owner,
/// 2026-11-09).
enum OwnFigure: String, CaseIterable, Identifiable, Sendable {
    case cruiseTasKt = "cruise_tas_kt"
    case fuelBurnGph = "fuel_burn_gph"
    case cruisePowerPct = "cruise_power_pct"
    case usableFuelGal = "usable_fuel_gal"
    case climbTasKt = "climb_tas_kt"
    case climbFuelBurnGph = "climb_fuel_burn_gph"
    case climbRateFpm = "climb_rate_fpm"
    case descentIasKt = "descent_ias_kt"
    case descentFuelBurnGph = "descent_fuel_burn_gph"
    case serviceCeilingFt = "service_ceiling_ft"
    case taxiFuelGal = "taxi_fuel_gal"
    case glideRatio = "glide_ratio"
    case emptyWeightLb = "empty_weight_lb"
    case emptyMomentLbIn = "empty_moment_lb_in"

    var id: String { rawValue }

    /// The figures the gateway keeps in the record's `figures` (OwnFigures),
    /// which PUT /api/aircraft/{id}/figures adds one at a time; the rest
    /// are the record's own members, saved with the whole airplane.
    static let recordFigures: Set<OwnFigure> = [.serviceCeilingFt, .climbRateFpm, .taxiFuelGal, .glideRatio, .emptyWeightLb, .emptyMomentLbIn]

    /// Its row's name, in the airplane form's words.
    var label: String {
        switch self {
        case .cruiseTasKt: "Cruise speed (TAS)"
        case .fuelBurnGph: "Cruise fuel burn"
        case .cruisePowerPct: "Cruise power"
        case .usableFuelGal: "Usable fuel"
        case .climbTasKt: "Climb speed (TAS)"
        case .climbFuelBurnGph: "Climb fuel burn"
        case .climbRateFpm: "Climb rate at sea level"
        case .descentIasKt: "Descent speed (IAS)"
        case .descentFuelBurnGph: "Descent fuel burn"
        case .serviceCeilingFt: "Service ceiling"
        case .taxiFuelGal: "Start and taxi fuel"
        case .glideRatio: "Glide ratio"
        case .emptyWeightLb: "Empty weight"
        case .emptyMomentLbIn: "Empty moment"
        }
    }

    var unit: String {
        switch self {
        case .cruiseTasKt, .climbTasKt, .descentIasKt: "kt"
        case .fuelBurnGph, .climbFuelBurnGph, .descentFuelBurnGph: "gal/h"
        case .cruisePowerPct: "%"
        case .usableFuelGal, .taxiFuelGal: "gal"
        case .climbRateFpm: "fpm"
        case .serviceCeilingFt: "ft"
        case .glideRatio: ": 1"
        case .emptyWeightLb: "lb"
        case .emptyMomentLbIn: "lb-in"
        }
    }

    /// The question asked where the figure is needed and missing, of the
    /// airplane by its N-number, else by its type.
    func question(_ airplane: String) -> String {
        switch self {
        case .cruiseTasKt: "How fast does \(airplane) cruise, true airspeed?"
        case .fuelBurnGph: "How much fuel does \(airplane) burn an hour in cruise?"
        case .cruisePowerPct: "At what power does \(airplane) cruise?"
        case .usableFuelGal: "How much usable fuel does \(airplane) carry?"
        case .climbTasKt: "How fast does \(airplane) climb, true airspeed?"
        case .climbFuelBurnGph: "How much fuel does \(airplane) burn an hour in the climb?"
        case .climbRateFpm: "How fast does \(airplane) climb at sea level?"
        // Indicated, as its POH's Section 5 gives the descent; the engine
        // makes it true at the descent's altitude (FAA-H-8083-25C ch. 8).
        case .descentIasKt: "How fast does \(airplane) descend, indicated airspeed?"
        case .descentFuelBurnGph: "How much fuel does \(airplane) burn an hour in the descent?"
        // The altitude its best rate of climb falls to 100 fpm
        // (FAA-H-8083-25C, chapter 11).
        case .serviceCeilingFt: "What is \(airplane)'s service ceiling?"
        case .taxiFuelGal: "How much fuel does \(airplane) use to start and taxi?"
        // Still air, propeller windmilling, flaps up: its POH's Section 3.
        case .glideRatio: "What is \(airplane)'s glide ratio?"
        case .emptyWeightLb: "What is \(airplane)'s basic empty weight?"
        case .emptyMomentLbIn: "What is \(airplane)'s basic empty moment?"
        }
    }
}

/// What a screen shows that needs the airplane's figures, as the engine's
/// airplane_needs names it: it answers the inputs the airplane lacks.
enum AirplaneNeed: String, Sendable {
    case legs
    case fuelTotals = "fuel_totals"
    case glide
    case climb
    case descent
    case weightBalance = "weight_balance"
    case takeoffLanding = "takeoff_landing"
}

/// Where a figure comes from, as the profile says it beside the figure.
enum FigureSource {
    /// The engine's source ("book", "handbook", "pilot") in the app's words.
    static func words(_ source: String?) -> String {
        switch source {
        case "book": "Book"
        case "handbook": "Handbook Photo"
        case "pilot": "You"
        default: "Not Given"
        }
    }
}
