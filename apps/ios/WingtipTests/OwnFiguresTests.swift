import Foundation
import OpenAPIRuntime
import Testing
@testable import Wingtip

/// An airplane's own figures (the owner, 2026-11-09): none assumed from a
/// Cessna 172, each with where it comes from (the engine's
/// airplane_figures), a missing one asked for where it is needed
/// (airplane_needs, AskFigureModel), kept on the device signed out
/// (OwnFigureStore), and the Map's Glide Ring off with its reason where
/// the airplane has no glide ratio.
@MainActor
struct OwnFiguresTests {
    /// A type's book as the planner sends it, the figures the engine reads.
    static let book: [String: OpenAPIValueContainer] = [
        "name": "c172", "cruise_tas_kt": 122, "fuel_burn_gph": 8.4, "taxi_fuel_gal": 1.4,
        "climb_tas_kt": 74, "climb_rate_fpm_sea_level": 730, "service_ceiling_ft": 14000,
        "glide": try! OpenAPIValueContainer(unvalidatedValue: ["ratio": 9.0]),
    ]

    private func defaults(_ name: String) throws -> UserDefaults {
        let d = try #require(UserDefaults(suiteName: name))
        d.removePersistentDomain(forName: name)
        return d
    }

    @Test func eachFigureSaysWhereItComesFrom() throws {
        let answer = try #require(Airplanes.answer(book: Self.book, handbook: nil, own: Figures(cruiseTasKt: 115, taxiFuelGal: 1.4)))
        let source = { (f: OwnFigure) in answer.figures.first { $0.key == f.rawValue } }
        // The pilot's own over the book's, with the book's kept for Reset.
        #expect(source(.cruiseTasKt)?.source == "pilot" && source(.cruiseTasKt)?.value == 115 && source(.cruiseTasKt)?.book == 122)
        // One the pilot left as the book's is still the book's.
        #expect(source(.taxiFuelGal)?.source == "book")
        #expect(source(.glideRatio)?.value == 9 && source(.glideRatio)?.source == "book")
        // The empty weight is the pilot's alone: no book figure.
        #expect(source(.emptyWeightLb)?.value == nil && source(.emptyWeightLb)?.source == nil)
        #expect(FigureSource.words("book") == "Book" && FigureSource.words("handbook") == "Handbook Photo")
        #expect(FigureSource.words("pilot") == "You" && FigureSource.words(nil) == "Not Given")
    }

    @Test func anOwnAirplaneOfNoStockTypeHasNoOtherAirplanesFigures() throws {
        // No book: the pilot's figures alone, nothing of a 172's.
        let answer = try #require(Airplanes.answer(book: nil, handbook: nil, own: Figures(cruiseTasKt: 140, fuelBurnGph: 10)))
        let figures = Figures(answer)
        #expect(figures.cruiseTasKt == 140 && figures.taxiFuelGal == nil && figures.glideRatio == nil && figures.serviceCeilingFt == nil)
        let missing = try Engine.airplaneNeeds(profile: answer.profile, figure: AirplaneNeed.fuelTotals.rawValue).missing
        #expect(missing == ["taxi_fuel_gal"])
    }

    @Test func theAskIsTheFirstMissingInputNotPutOff() {
        #expect(AskFigureModel.ask(missing: ["airplane"], putOff: [], airplane: "N123AB") == .pick)
        #expect(AskFigureModel.ask(missing: ["taxi_fuel_gal"], putOff: [], airplane: "N123AB") == .figure(.taxiFuelGal))
        // Not Now leaves that one out, the next asked.
        #expect(AskFigureModel.ask(missing: ["climb_tas_kt", "climb_rate_fpm"], putOff: ["N123AB|climb_tas_kt"], airplane: "N123AB") == .figure(.climbRateFpm))
        // Another airplane's Not Now is not this one's.
        #expect(AskFigureModel.ask(missing: ["climb_tas_kt"], putOff: ["N999ZZ|climb_tas_kt"], airplane: "N123AB") == .figure(.climbTasKt))
        // A handbook's table is a link, not a field.
        #expect(AskFigureModel.ask(missing: ["loading", "empty_weight_lb"], putOff: [], airplane: "N123AB") == .table("loading"))
        #expect(AskFigureModel.ask(missing: [], putOff: [], airplane: "N123AB") == nil)
        #expect(AskFigureModel.number("1,5") == 1.5 && AskFigureModel.number("0") == nil && AskFigureModel.number("abc") == nil)
        #expect(OwnFigure.taxiFuelGal.question("N123AB") == "How much fuel does N123AB use to start and taxi?")
    }

    @Test func thePlanAsksForWhatItsAirplaneLacks() throws {
        let airplanes = Airplanes()
        let plan = Plan()
        let model = AskFigureModel()
        // No airplane: the picker.
        #expect(try model.ask([.glide], plan: plan, airplanes: airplanes) == .pick)
        // An own airplane of no stock type: its cruise first, planned with
        // no airplane until it has one.
        plan.tail = "N123AB"
        plan.aircraft = Plan.ownAirplane
        #expect(plan.plannerAircraft == nil)
        #expect(try model.ask([.fuelTotals], plan: plan, airplanes: airplanes) == .figure(.cruiseTasKt))
        plan.figures = Figures(cruiseTasKt: 140, fuelBurnGph: 10)
        #expect(plan.plannerAircraft == Plan.ownAirplane)
        #expect(try model.ask([.fuelTotals], plan: plan, airplanes: airplanes) == .figure(.taxiFuelGal))
        #expect(try model.ask([.glide], plan: plan, airplanes: airplanes) == .figure(.glideRatio))
        // A stock type whose book is not yet in asks nothing it may have.
        plan.aircraft = "c172"
        #expect(try model.ask([.fuelTotals], plan: plan, airplanes: airplanes) == nil)
    }

    @Test func aTypeTheEngineCannotMatchFliesOnItsOwnFiguresAlone() {
        #expect(Plan.profile(type: nil, profiles: ["c172"]) == Plan.ownAirplane)
        #expect(Plan.profile(type: "be36", profiles: ["c172"]) == Plan.ownAirplane)
        #expect(Plan.profile(type: "c172", profiles: ["c172"]) == "c172")
        let plan = Plan()
        plan.aircraft = Plan.ownAirplane
        #expect(plan.stockType == nil && plan.airplaneName == nil)
        plan.tail = "N123AB"
        #expect(plan.loadKey == "N123AB" && plan.airplaneName == "N123AB")
    }

    @Test func aNewRecordNeedsItsCruiseAndBurnAndANamedType() throws {
        #expect(Airplanes.request(tail: "N123AB", type: nil, Figures(glideRatio: 9)) == nil)
        let request = try #require(Airplanes.request(tail: "N123AB", type: nil, Figures(cruiseTasKt: 140, fuelBurnGph: 10, glideRatio: 9)))
        // No designator known: ICAO's ZZZZ, never a 172's.
        #expect(request.typeDesignator == Airplanes.noDesignator && request.figures?.glideRatio == 9)
        #expect(Airplanes.request(tail: "N123AB", type: "c182", Figures(cruiseTasKt: 140, fuelBurnGph: 10))?.typeDesignator == "C182")
    }

    @Test func figuresGoToThePlannerAndTheEngineByTheirKeys() {
        let f = Figures(cruiseTasKt: 140, taxiFuelGal: 1.2, glideRatio: 9, emptyWeightLb: 1700)
        #expect(f.engine.count == OwnFigure.allCases.count && f.engine["fuel_burn_gph"]?.value == nil && f.engine["empty_weight_lb"]?.number == 1700)
        #expect(f.gateway.taxiFuelGal == 1.2 && f.gateway.emptyWeightLb == 1700)
    }

    @Test func signedOutFiguresAreKeptOnTheDeviceAndForgottenAtSignOut() throws {
        let d = try defaults("OwnFiguresTests.store")
        OwnFigureStore.save(Figures(taxiFuelGal: 1.2), for: "N123AB", defaults: d)
        OwnFigureStore.save(Figures(glideRatio: 9), for: OwnFigureStore.name(tail: nil, aircraft: "c172"), defaults: d)
        OwnFigureStore.save(Figures(), for: "N999ZZ", defaults: d)
        #expect(OwnFigureStore.load("N123AB", defaults: d).taxiFuelGal == 1.2)
        // Only the N-numbers are offered at sign-in: an account keeps
        // airplanes by N-number.
        #expect(OwnFigureStore.tails(defaults: d) == ["N123AB": Figures(taxiFuelGal: 1.2)])
        #expect(OwnFigureStore.prefix.hasPrefix("wingtip."))
        Session.forgetPilot(d)
        #expect(OwnFigureStore.load("N123AB", defaults: d).isEmpty && OwnFigureStore.tails(defaults: d).isEmpty)
    }

    @Test func theGlideRingSwitchSaysWhyItIsOff() throws {
        let airplanes = Airplanes()
        let plan = Plan()
        #expect(GlideRingToggle.unavailable(plan: plan, airplanes: airplanes) == "Pick an airplane: the ring is its own glide")
        plan.tail = "N123AB"
        plan.aircraft = Plan.ownAirplane
        #expect(GlideRingToggle.unavailable(plan: plan, airplanes: airplanes) == "N123AB has no glide ratio: add it in its profile")
        plan.figures.glideRatio = 9
        #expect(GlideRingToggle.unavailable(plan: plan, airplanes: airplanes) == nil)
        // Switched on, the ring is drawn at the airplane's own ratio.
        let d = try defaults("OwnFiguresTests.ring")
        #expect(InFlight.ringRatio(plan: plan, defaults: d, airplanes: airplanes) == nil)
        // On by itself while the emergency assistant is open, the switch off.
        #expect(InFlight.ringRatio(plan: plan, emergency: true, defaults: d, airplanes: airplanes) == 9)
        d.set(true, forKey: InFlight.ringKey)
        #expect(InFlight.ringRatio(plan: plan, defaults: d, airplanes: airplanes) == 9)
    }
}

/// The loading takes the airplane's own empty weight and moment.
struct OwnEmptyWeightTests {
    @Test func theRecordsEmptyWeightAndMomentStandForTheSampleAirplanes() throws {
        let sample = AirplaneLoad(emptyArmIn: 38.12, emptyWeightLb: 1642, fuelGal: 53, stationsLb: [170, 0])
        #expect(Verdict.ownEmpty(sample, figures: Figures()) == nil)
        #expect(Verdict.ownEmpty(sample, figures: Figures(emptyWeightLb: 1700)) == nil)
        let own = try #require(Verdict.ownEmpty(sample, figures: Figures(emptyWeightLb: 1700, emptyMomentLbIn: 68000)))
        // 68,000 lb-in over 1,700 lb is a 40 in arm (FAA-H-8083-1B).
        #expect(own.emptyWeightLb == 1700 && own.emptyArmIn == 40 && own.stationsLb == [170, 0] && own.fuelGal == 53)
    }
}
