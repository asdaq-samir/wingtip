import Foundation
import Observation

/// The clearance sheet's look-ups (ClearanceSheet, MVVM): the route's
/// place names the recogniser is primed with, and the places a clearance
/// names -- the planner's, else with no signal the engine's among the
/// regions kept for the air (`clearance_hear` over the cycle packs) --
/// each failure said where it shows, never an empty list in its place.
@MainActor
@Observable
final class ClearanceLookup {
    /// The route's place names for the recogniser; empty where they
    /// couldn't be had, which `wordsProblem` says.
    private(set) var words: [String] = []
    private(set) var wordsProblem: String?
    private(set) var found: ClearancePlaces?
    /// The words `found` was looked up for.
    private(set) var foundFor: String?
    private(set) var problem: String?

    /// The route's place names, from the planner.
    func loadWords(near: String, dep: String) async {
        do {
            words = try await Planner.clearanceWords(near: near, dep: dep)
            wordsProblem = nil
        } catch {
            words = []
            wordsProblem = "The route's place names couldn't be had, so listening goes without them."
        }
    }

    /// The places `heard` names, looked up.
    func lookUp(_ heard: String, near: String, nearPoints: [(Double, Double)], dep: String, stops: [String], dest: String) async {
        do {
            found = try await Planner.clearancePlaces(try Clearance.read(heard).asked(near: near, dep: dep, dest: dest))
            foundFor = heard
            problem = nil
        } catch {
            // No signal: found by the engine among the places of the
            // regions kept for the air, SIDs and STARs left as said.
            if let offline = await Self.offline(heard, near: nearPoints, dep: dep, stops: stops, dest: dest) {
                found = offline.found
                foundFor = heard
                problem = "No signal: places found among the regions kept for the air."
            } else {
                problem = "The places in it could not be looked up; check the connection and try again."
            }
        }
    }

    /// What the engine hears in `heard` among the regions kept for the air
    /// (`clearance_hear`); nil with none kept or where it cannot read it.
    /// Off the main actor, as CyclePacks' own reads are: every kept pack is
    /// read, which stalled the screen while a clearance was read in flight
    /// (IOS-22, old N12b).
    @concurrent nonisolated static func offline(_ heard: String, near: [(Double, Double)], dep: String, stops: [String], dest: String) async -> Engine.Heard? {
        let packs = CyclePacks.shared.keptPacks()
        guard !packs.isEmpty else { return nil }
        return Engine.hear(heard, tail: nil, packs: packs, near: near, dep: dep, stops: stops, dest: dest)
    }
}
