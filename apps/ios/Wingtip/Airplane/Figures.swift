import Foundation
import OpenAPIRuntime

/// The pilot's own figures for the airplane flown: its record's on the
/// gateway, or kept on this device while signed out (OwnFigureStore). Each
/// is flown over its type's book figure, and for an airplane of no stock
/// type they are its figures alone (the planner's aircraft "own"); one not
/// given is nil, never another airplane's (the owner, 2026-11-09).
struct Figures: Codable, Equatable, Sendable {
    var cruiseTasKt: Double?
    var fuelBurnGph: Double?
    var usableFuelGal: Double?
    var cruisePowerPct: Double?
    var climbTasKt: Double?
    var climbFuelBurnGph: Double?
    /// The descent's indicated airspeed and fuel flow, the POH's; with
    /// neither the descent is flown on the cruise's (the engine's
    /// descent_phase, which says so as descent_at_cruise).
    var descentIasKt: Double?
    var descentFuelBurnGph: Double?
    var serviceCeilingFt: Double?
    var climbRateFpm: Double?
    var taxiFuelGal: Double?
    var glideRatio: Double?
    var emptyWeightLb: Double?
    var emptyMomentLbIn: Double?

    init(cruiseTasKt: Double? = nil, fuelBurnGph: Double? = nil, usableFuelGal: Double? = nil, cruisePowerPct: Double? = nil, climbTasKt: Double? = nil,
         climbFuelBurnGph: Double? = nil, serviceCeilingFt: Double? = nil, climbRateFpm: Double? = nil, taxiFuelGal: Double? = nil, glideRatio: Double? = nil,
         emptyWeightLb: Double? = nil, emptyMomentLbIn: Double? = nil, descentIasKt: Double? = nil, descentFuelBurnGph: Double? = nil) {
        self.cruiseTasKt = cruiseTasKt; self.fuelBurnGph = fuelBurnGph; self.usableFuelGal = usableFuelGal
        self.cruisePowerPct = cruisePowerPct; self.climbTasKt = climbTasKt; self.climbFuelBurnGph = climbFuelBurnGph
        self.serviceCeilingFt = serviceCeilingFt; self.climbRateFpm = climbRateFpm; self.taxiFuelGal = taxiFuelGal
        self.glideRatio = glideRatio; self.emptyWeightLb = emptyWeightLb; self.emptyMomentLbIn = emptyMomentLbIn
        self.descentIasKt = descentIasKt; self.descentFuelBurnGph = descentFuelBurnGph
    }

    /// The pilot's airplane record's figures, every one it keeps.
    init(_ own: OwnAircraftRecord) {
        let f = own.figures
        self.init(cruiseTasKt: own.cruiseTasKt, fuelBurnGph: own.fuelBurnGph, usableFuelGal: own.usableFuelGal, cruisePowerPct: own.cruisePowerPct,
                  climbTasKt: own.climbTasKt, climbFuelBurnGph: own.climbFuelBurnGph, serviceCeilingFt: f.serviceCeilingFt, climbRateFpm: f.climbRateFpm,
                  taxiFuelGal: f.taxiFuelGal, glideRatio: f.glideRatio, emptyWeightLb: f.emptyWeightLb, emptyMomentLbIn: f.emptyMomentLbIn,
                  descentIasKt: own.descentIasKt, descentFuelBurnGph: own.descentFuelBurnGph)
    }

    /// The figures off the engine's airplane_figures answer, each its
    /// value whatever its source: the book's under the pilot's.
    init(_ answer: EngineContract.AirplaneFiguresAnswer) {
        self.init()
        for item in answer.figures {
            if let figure = OwnFigure(rawValue: item.key) { self[figure] = item.value }
        }
    }

    subscript(_ figure: OwnFigure) -> Double? {
        get {
            switch figure {
            case .cruiseTasKt: cruiseTasKt
            case .fuelBurnGph: fuelBurnGph
            case .cruisePowerPct: cruisePowerPct
            case .usableFuelGal: usableFuelGal
            case .climbTasKt: climbTasKt
            case .climbFuelBurnGph: climbFuelBurnGph
            case .climbRateFpm: climbRateFpm
            case .descentIasKt: descentIasKt
            case .descentFuelBurnGph: descentFuelBurnGph
            case .serviceCeilingFt: serviceCeilingFt
            case .taxiFuelGal: taxiFuelGal
            case .glideRatio: glideRatio
            case .emptyWeightLb: emptyWeightLb
            case .emptyMomentLbIn: emptyMomentLbIn
            }
        }
        set {
            switch figure {
            case .cruiseTasKt: cruiseTasKt = newValue
            case .fuelBurnGph: fuelBurnGph = newValue
            case .cruisePowerPct: cruisePowerPct = newValue
            case .usableFuelGal: usableFuelGal = newValue
            case .climbTasKt: climbTasKt = newValue
            case .climbFuelBurnGph: climbFuelBurnGph = newValue
            case .climbRateFpm: climbRateFpm = newValue
            case .descentIasKt: descentIasKt = newValue
            case .descentFuelBurnGph: descentFuelBurnGph = newValue
            case .serviceCeilingFt: serviceCeilingFt = newValue
            case .taxiFuelGal: taxiFuelGal = newValue
            case .glideRatio: glideRatio = newValue
            case .emptyWeightLb: emptyWeightLb = newValue
            case .emptyMomentLbIn: emptyMomentLbIn = newValue
            }
        }
    }

    var isEmpty: Bool { self == Figures() }

    /// Whether the planner can fly an airplane of no stock type on them:
    /// its cruise speed and burn are the two it requires (the planner's
    /// wingtip.planning.OWN_AIRPLANE).
    var flyable: Bool { cruiseTasKt != nil && fuelBurnGph != nil }

    /// airplane_figures' `own`: every figure by its key, null where not given.
    var engine: [String: OpenAPIValueContainer] {
        Dictionary(uniqueKeysWithValues: OwnFigure.allCases.map { ($0.rawValue, self[$0].map(OpenAPIValueContainer.init(number:)) ?? nil) })
    }

    /// The gateway's OwnFigures: those six of them, nil left out (which
    /// the whole airplane's PUT reads as cleared).
    var gateway: GWOwnFigures {
        GWOwnFigures(climbRateFpm: climbRateFpm, emptyMomentLbIn: emptyMomentLbIn, emptyWeightLb: emptyWeightLb, glideRatio: glideRatio,
                     serviceCeilingFt: serviceCeilingFt, taxiFuelGal: taxiFuelGal)
    }
}
