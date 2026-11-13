import Foundation
import Observation

/// The Airplane page's view model (AircraftView, MVVM): the stock types
/// the planner flies and the pilot's own airplanes from the gateway, each
/// fetch's failure said where its list is, never an empty list in its
/// place (an own airplane missing would read as none saved).
@MainActor
@Observable
final class AirplanePickModel {
    private(set) var profiles: [AircraftProfile] = []
    private(set) var own: [OwnAircraftRecord] = []
    /// The stock types' failure, under their list.
    private(set) var problem: String?
    /// The pilot's own airplanes' failure, under Yours.
    private(set) var ownProblem: String?

    func loadProfiles() async {
        do { profiles = try await Planner.aircraftProfiles(); problem = nil } catch { problem = error.localizedDescription }
    }

    /// The pilot's own, signed in; none signed out (they are the gateway's).
    func loadOwn(signedIn: Bool) async {
        guard signedIn else { own = []; ownProblem = nil; return }
        do {
            own = try await Gateway.aircraftRecords()
            ownProblem = nil
        } catch {
            ownProblem = "Your airplanes couldn't be fetched: \(error.localizedDescription)"
        }
    }
}
