import Foundation
import Observation

/// The Brief's Go / No-Go and what only the pilot can tell it: their
/// personal minimums and each airplane's loading, kept on this device as
/// the web app keeps them in the browser, and the risk assessment's own
/// checks, ticked for this session (they are about the pilot today, not
/// the route). The answer is the planner's (Planner.goNoGo); nothing here
/// judges the flight.
@MainActor
@Observable
final class Verdict {
    private(set) var minimums: PersonalMinimums
    /// Each airplane's load, by the planner's profile name.
    private(set) var loads: [String: AirplaneLoad]
    private(set) var ticked: Set<String> = []
    private(set) var answer: GoNoGoAnswer?
    private(set) var problem: String?
    /// Where the pilot's currency or airplanes' records couldn't be
    /// fetched: said with the verdict, which is then worked without them,
    /// and asked again on the next refresh.
    private(set) var pilotProblem: String?
    private(set) var asking = false
    /// The pilot's currency from their logbook, fetched once signed in.
    private var currency: Currency?
    /// The pilot's own airplanes, for the one flown's records.
    private var records: [OwnAircraftRecord] = []
    private var currencyAsked = false
    private let store: UserDefaults

    static let minimumsKey = "goNoGo.minimums"
    static let loadsKey = "goNoGo.loads"

    init(store: UserDefaults = .standard) {
        self.store = store
        minimums = store.decoded(PersonalMinimums.self, forKey: Self.minimumsKey) ?? PersonalMinimums()
        loads = store.decoded([String: AirplaneLoad].self, forKey: Self.loadsKey) ?? [:]
    }

    func setMinimum(_ key: PersonalMinimums.Key, _ value: Double?) {
        minimums[key] = value
        store.setEncoded(minimums, forKey: Self.minimumsKey)
    }

    func load(for aircraft: String) -> AirplaneLoad? { loads[aircraft] }

    func setLoad(_ load: AirplaneLoad, for aircraft: String) {
        loads[aircraft] = load
        store.setEncoded(loads, forKey: Self.loadsKey)
    }

    func tick(_ key: String, _ on: Bool) {
        if on { ticked.insert(key) } else { ticked.remove(key) }
    }

    /// The question for the plan on the page: the route as its nav log
    /// was asked, and the pilot's own.
    func ask(for plan: Plan, today: Date = Date()) throws -> GoNoGoAsk {
        let figures = plan.figures
        var ask = GoNoGoAsk(dep: plan.dep, dest: plan.dest)
        ask.stops = plan.stops.joined(separator: ",")
        ask.aircraft = plan.plannerAircraft
        ask.altitudeFt = plan.ownAltitudeFt
        ask.altitudeNearest = plan.ownAltitudeFt != nil && plan.ownAltitudeLegal
        ask.altitudeChoice = plan.altitudeChoice ?? "fastest"
        ask.procedures = try ProcedurePick.text(plan.procedures.filter { plan.idents.contains($0.ident) })
        ask.cruiseTasKt = figures.cruiseTasKt; ask.fuelBurnGph = figures.fuelBurnGph; ask.usableFuelGal = figures.usableFuelGal
        ask.cruisePowerPct = figures.cruisePowerPct; ask.climbTasKt = figures.climbTasKt; ask.climbFuelBurnGph = figures.climbFuelBurnGph
        ask.descentIasKt = figures.descentIasKt; ask.descentFuelBurnGph = figures.descentFuelBurnGph
        ask.serviceCeilingFt = figures.serviceCeilingFt
        ask.climbRateFpm = figures.climbRateFpm; ask.taxiFuelGal = figures.taxiFuelGal; ask.glideRatio = figures.glideRatio
        ask.day = Day.string(today)
        ask.minimums = minimums
        // The loading kept for the airplane, else the last one the planner
        // weighed with the airplane's own empty weight and moment from its
        // record, where set, in place of its handbook's sample airplane's.
        ask.load = loads[plan.loadKey] ?? Self.ownEmpty(answer?.balance?.load, figures: figures)
        ask.ticked = ticked.sorted()
        // The gateway's currency is the planner's PilotCurrency by name,
        // its camel case written in the planner's snake case.
        ask.currency = try currency.map { try Engine.recoded($0, encoder: Planner.snakeEncoder) }
        ask.ownAirplane = records.first { $0.tailNumber == plan.tail }.map(OwnAirplaneAsk.init)
        // The rules the nav log was planned under, and under IFR the
        // alternate filed: the planner then checks the destination and the
        // alternate (14 CFR 91.169) into the weather's finding.
        let rules = FlightRules.saved()
        ask.rules = rules == .ifr ? "ifr" : nil
        ask.alternate = plan.extras.filedAlternate(rules: rules)
        return ask
    }

    /// Asks the planner again, once the nav log has come to an end, and
    /// whenever what the pilot set changes; a newer ask replaces an older.
    func refresh(plan: Plan, signedIn: Bool) async {
        guard plan.routed, plan.totals != nil || plan.problem != nil else { return }
        // A moment's pause, so a run of edits is one ask.
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled else { return }
        if signedIn, !currencyAsked {
            currencyAsked = true
            var missing: [String] = []
            do { currency = try await Gateway.currency() } catch { missing.append("your currency"); currencyAsked = false }
            do { records = try await Gateway.aircraftRecords() } catch { missing.append("your airplanes' records"); currencyAsked = false }
            pilotProblem = missing.isEmpty ? nil : "The verdict goes without \(missing.joined(separator: " and ")): they couldn't be fetched."
        }
        asking = true
        defer { asking = false }
        do {
            // The last good answer for the route kept on this phone, and
            // given back with its age when there is no signal (KeptForAir).
            let asked = try ask(for: plan)
            let answer = try await KeptForAir.answer(.goNoGo, key: ReadyToFly.flightKey(plan)) { try await Planner.goNoGo(asked) }.value
            guard !Task.isCancelled else { return }
            self.answer = Self.shown(answer, airplane: plan.airplaneChosen)
            problem = nil
        } catch {
            guard !Task.isCancelled else { return }
            problem = error.localizedDescription
        }
    }

    /// A flight logged: the currency (the engine's, from the logbook) is
    /// asked again with the next Go / No-Go.
    func logbookChanged() {
        currencyAsked = false
        currency = nil
    }

    /// A loading with the airplane's own basic empty weight and moment
    /// (its weight and balance record): the arm is the moment over the
    /// weight (FAA-H-8083-1B, chapter 2). Nil where either is not given.
    nonisolated static func ownEmpty(_ load: AirplaneLoad?, figures: Figures) -> AirplaneLoad? {
        guard var load, let weight = figures.emptyWeightLb, let moment = figures.emptyMomentLbIn, weight > 0 else { return nil }
        load.emptyWeightLb = weight
        load.emptyArmIn = moment / weight
        return load
    }

    /// The findings that need an airplane's figures: the fuel, the
    /// runways' distances and crosswind limits, the weight and balance
    /// (the web's AIRPLANE_ITEMS).
    nonisolated static let airplaneItems: Set<String> = ["fuel", "runways", "balance"]

    /// The planner's answer as the Brief shows it: with no airplane picked
    /// those findings and the loading are left out, not judged on an
    /// airplane assumed (docs/decisions/0011).
    nonisolated static func shown(_ answer: GoNoGoAnswer, airplane: Bool) -> GoNoGoAnswer {
        guard !airplane else { return answer }
        var shown = answer
        shown.items = answer.items.filter { !airplaneItems.contains($0.key) }
        shown.loading = nil
        shown.balance = nil
        return shown
    }

    /// What a new ask turns on: the plan's route and times, and every
    /// input of the pilot's.
    func key(for plan: Plan) -> String {
        // An ask the engine could not write keys on its reason, which the
        // refresh then shows as the problem.
        let body: String
        do { body = String(decoding: try Planner.snakeEncoder.encode(try ask(for: plan)), as: UTF8.self) } catch { body = "\(error)" }
        return "\(body)|\(plan.plannedAt?.timeIntervalSince1970 ?? 0)|\(plan.problem?.detail ?? "")"
    }
}
