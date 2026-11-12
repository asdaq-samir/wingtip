import Foundation

// The pilot's own things on the gateway: saved flights, the logbook and
// the currency it works out (FlightController, LogbookController), each
// the gateway's model generated from its OpenAPI document
// (WingtipAPI/GatewayAPI, the GW prefix), named here as the app
// names them. The gateway's dates and figures are shown as given; the app
// computes no currency of its own (61.56, 61.57 live in the gateway).

/// A flight saved as planned (FlightSummaryDto).
typealias SavedFlight = GWFlightSummaryDto
typealias SaveFlightCheckpoint = GWSaveFlightCheckpointRequest
typealias SaveFlightRequest = GWSaveFlightRequest
/// A flight logged (LogbookEntryDto): the columns a student's 61.109
/// experience and instrument currency (61.57(c)) are counted from.
typealias LogbookEntry = GWLogbookEntryDto
/// What the gateway says of the pilot's currency (CurrencyDto): the dates
/// each of 61.57's windows runs to, the flight review and the medical,
/// and the hours behind them; `instrumentCurrentFrom` the first day of an
/// instrument currency not begun yet, approaches flown this month counting
/// from next month (14 CFR 61.57(c)(1)).
typealias Currency = GWCurrencyDto
/// The student's training (TrainingDto) and its parts.
typealias Training = GWTrainingDto
typealias InstructorLink = GWInstructorLinkDto
typealias SignedEndorsement = GWSignedEndorsementDto
typealias ReviewCheck = GWReviewCheckDto
typealias CrossCountryReview = GWCrossCountryReviewDto
/// One line of the experience logged against a requirement
/// (ExperienceItemDto): what is had and needed, in its unit, and the rule
/// it comes from, judged by the gateway.
typealias ExperienceItem = GWExperienceItemDto

extension SavedFlight: @retroactive Identifiable {}
extension LogbookEntry: @retroactive Identifiable {}
extension InstructorLink: @retroactive Identifiable {}
extension SignedEndorsement: @retroactive Identifiable {}
extension CrossCountryReview: @retroactive Identifiable {}

extension Gateway {
    static func training() async throws -> Training? { try await read { try await $0.getTraining().ok.body.json } }

    /// An instructor asked in by their address (/api/training/instructors).
    static func askInstructor(email: String) async throws {
        _ = try await call { try await $0.askInstructor(body: .json(GWAskInstructorRequest(email: email))) }
    }

    static func flights() async throws -> [SavedFlight] { try await read { try await $0.getFlights().ok.body.json } ?? [] }
    static func logbook() async throws -> [LogbookEntry] { try await read { try await $0.getLogbook().ok.body.json } ?? [] }
    static func currency() async throws -> Currency? { try await read { try await $0.currency().ok.body.json } }

    /// A flight saved as planned (POST /api/flights).
    static func save(_ flight: SaveFlightRequest) async throws {
        _ = try await call { try await $0.save(body: .json(flight)) }
    }

    /// A saved flight's name or notes changed (PATCH /api/flights/{id}):
    /// a field left nil is kept, a blank one clears it; the flight's
    /// summary as it now stands comes back.
    static func updateFlight(_ id: Int, _ change: GWUpdateFlightRequest) async throws -> SavedFlight {
        try await call { try await $0.patchFlightsId(path: .init(id: id), body: .json(change)).ok.body.json }
    }

    static func deleteFlight(_ id: Int) async throws {
        _ = try await call { try await $0.deleteFlightsId(path: .init(id: id)) }
    }

    /// One of the pilot's flights shared by link (POST /api/flights/{id}/share),
    /// its N-number with it only where `includeTail`; the same link while it
    /// stays shared.
    static func shareFlight(_ id: Int, includeTail: Bool) async throws -> GWFlightShareDto {
        try await call { try await $0.share(path: .init(id: id), body: .json(GWShareFlightRequest(includeTail: includeTail))).ok.body.json }
    }

    /// Stops sharing it (DELETE /api/flights/{id}/share): its link answers
    /// "no longer shared" for everyone it went to.
    static func stopSharing(_ id: Int) async throws {
        _ = try await call { try await $0.deleteFlightsIdShare(path: .init(id: id)) }
    }

    /// A flight another pilot shared, read by its token, signed in or not;
    /// nil where it is not (or no longer) shared.
    static func sharedFlight(_ token: String) async throws -> GWSharedFlightDto? {
        try await read(none: [404]) { try await $0.shared(path: .init(token: token)).ok.body.json }
    }
}
