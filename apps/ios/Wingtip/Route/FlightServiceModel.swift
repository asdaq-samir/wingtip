import Foundation
import Observation

/// Filing with Flight Service's view model (FlightServiceView, MVVM):
/// whether the gateway has filing connected, the reference a filed plan
/// came back with, the standard briefing, and each failure said where it
/// happened -- a status that couldn't be asked is said, never read as
/// "not connected".
@MainActor
@Observable
final class FlightServiceModel {
    private(set) var status: FlightServiceStatus?
    private(set) var statusProblem: String?
    private(set) var reference: String?
    private(set) var briefing: String?
    private(set) var problem: String?
    private(set) var sending = false

    /// Whether filing is connected on the gateway.
    func load() async {
        do {
            status = try await Gateway.flightService()
            statusProblem = nil
        } catch {
            statusProblem = "Whether filing is connected here couldn't be checked: \(error.localizedDescription)"
        }
    }

    func file(_ request: FlightPlanFilingRequest) async {
        sending = true
        defer { sending = false }
        do { reference = try await Gateway.file(request); problem = nil } catch { problem = "Not filed: \(error.localizedDescription)" }
    }

    func brief(_ request: FlightPlanFilingRequest) async {
        sending = true
        defer { sending = false }
        do { briefing = try await Gateway.standardBriefing(request); problem = nil } catch { problem = "No briefing: \(error.localizedDescription)" }
    }
}
