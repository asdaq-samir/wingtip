import Foundation

/// An ATC clearance as the phone heard it, read into its items by the
/// engine (wingtip_engine::clearance, `read_clearance`) -- the web app's
/// lib/clearance, both held to the same fixture (clearances.json, the
/// engine's tests/clearance.rs and SharedFixturesTests): its limit, its
/// departure procedure, the route, the altitudes, the frequency and the
/// beacon code, as AIM 4-4-3 lists what a clearance holds. The places it
/// names are found by the planner (/api/clearance/places, the engine's
/// clearance_places rule), or
/// with no signal by the engine in the kept packs, and the route goes in
/// only from the sheet, the pilot having read it (ClearanceSheet).
struct Clearance: Codable, Equatable, Sendable {
    /// The clearance limit as said ("duluth airport").
    var limit: String?
    var route: [ClearedItem] = []
    /// "...then as filed" (AIM 5-2-6): the filed route after what was
    /// said, which leaves out the filed altitude.
    var asFiled = false
    var maintainFt: Int?
    /// "at or below" or "at or above".
    var maintainLimit: String?
    var vfr = false
    var expectFt: Int?
    /// Minutes after departure the expected altitude comes.
    var expectMin: Int?
    var frequency: String?
    /// Whose frequency: "departure", "center", "approach".
    var facility: String?
    var squawk: String?
    /// "Cleared into the Class Bravo airspace" (14 CFR 91.131(a)(1)).
    var classB = false

    /// Whether anything of a clearance was heard at all.
    var heardAny: Bool {
        limit != nil || !route.isEmpty || asFiled || maintainFt != nil || expectFt != nil || frequency != nil || squawk != nil || classB
    }
}

/// A part of the route, in the order it was said: "vectors", "heading",
/// "airway", "departure", "arrival", or "places" (words naming one place
/// or more, for the planner to find).
struct ClearedItem: Codable, Equatable, Sendable {
    var kind: String
    var degrees: Int?
    var ident: String?
    var name: String?
    var number: String?
    var transition: String?
    var said: String?
}

extension Clearance {
    /// The clearance in what was heard, read by the engine
    /// (`read_clearance`, the web's lib/clearance), with no signal
    /// needed; thrown where the engine cannot answer. The contract leaves
    /// the route's items open, so the answer is read again as the app's
    /// Clearance, the same members by name.
    static func read(_ text: String) throws -> Clearance {
        try Engine.recoded(try Engine.readClearance(text: text))
    }
}

/// What the planner found of a clearance's places (ClearancePlaces, generated).
typealias ClearancePlaces = APIClearancePlaces

extension ClearancePlaces {
    typealias Place = APISpokenPlace
    typealias Procedure = APISpokenProcedure
}

extension ClearancePlaces.Place {
    init(said: String, ident: String?, sure: Bool?) {
        self.init(ident: ident, kind: nil, lat: nil, lon: nil, name: nil, said: said, sure: sure)
    }
}

/// What the planner is asked to find (ClearanceAsk, generated).
typealias ClearanceAsk = APIClearanceAsk

extension ClearanceAsk {
    typealias Procedure = APISpokenProcedureAsk

    init(near: String, dep: String? = nil, dest: String? = nil, limit: String? = nil, route: [String] = [],
         departure: Procedure? = nil, arrival: Procedure? = nil) {
        self.init(arrival: arrival, dep: dep, departure: departure, dest: dest, limit: limit, near: near, route: route)
    }
}

extension Clearance {
    /// The planner's question for the clearance's places.
    func asked(near: String, dep: String, dest: String) -> ClearanceAsk {
        func named(_ kind: String) -> ClearanceAsk.Procedure? {
            route.first { $0.kind == kind }.map { ClearanceAsk.Procedure(name: $0.name ?? "", number: $0.number ?? "", transition: $0.transition) }
        }
        return ClearanceAsk(near: near, dep: dep.isEmpty ? nil : dep, dest: dest.isEmpty ? nil : dest, limit: limit,
                            route: route.compactMap { $0.kind == "places" ? $0.said : nil },
                            departure: named("departure"), arrival: named("arrival"))
    }

    /// A procedure to pick, as the web's typed one: its name and the
    /// points either side of it.
    typealias Typed = EngineContract.ClearedRouteAnswerTypedItem

    /// The route a clearance heard gives, from the one planned: its
    /// destination the limit where that is an airport; its stops the
    /// places and airways said in order, the SID's transition after the
    /// departure and the STAR's before the destination; with "then as
    /// filed" the filed stops after the last one said that is among them,
    /// or all of them where none is (AIM 5-2-6). The engine's
    /// `cleared_route`, the web's clearedRoute, from the words heard and
    /// the places found for them; thrown where the engine cannot answer,
    /// which the sheet says. The planner's places are the contract's found
    /// ones by name.
    static func clearedRoute(_ heard: String, _ found: ClearancePlaces, dep: String, stops planned: [String],
                             dest plannedDest: String) throws -> (dep: String, stops: [String], dest: String, typed: [Typed]) {
        let answer = try Engine.clearedRoute(text: heard, found: try Engine.recoded(found),
                                             planned: .init(dep: dep, stops: planned, dest: plannedDest))
        return (answer.route.dep, answer.route.stops, answer.route.dest, answer.typed)
    }
}
