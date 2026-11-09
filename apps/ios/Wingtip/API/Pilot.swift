import Foundation

// The pilot's own things on the gateway: saved flights, the logbook and
// the currency it works out (FlightController, LogbookController), each
// the gateway's model generated from its OpenAPI document
// (Generated/GatewayModels.swift, the GW prefix), named here as the app
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

extension SavedFlight: Identifiable {}
extension LogbookEntry: Identifiable {}
extension InstructorLink: Identifiable {}
extension SignedEndorsement: Identifiable {}
extension CrossCountryReview: Identifiable {}

extension Gateway {
    static func training() async throws -> Training? { try await read(Training.self, "/api/training") }

    /// An instructor asked in by their address (/api/training/instructors).
    static func askInstructor(email: String) async throws {
        try await send("POST", "/api/training/instructors", json: GWAskInstructorRequest(email: email))
    }

    static func flights() async throws -> [SavedFlight] { try await read([SavedFlight].self, "/api/flights") ?? [] }
    static func logbook() async throws -> [LogbookEntry] { try await read([LogbookEntry].self, "/api/logbook") ?? [] }
    static func currency() async throws -> Currency? { try await read(Currency.self, "/api/logbook/currency") }

    /// A flight saved as planned (POST /api/flights).
    static func save(_ flight: SaveFlightRequest) async throws {
        try await send("POST", "/api/flights", json: flight)
    }

    /// A saved flight's name or notes changed (PATCH /api/flights/{id}):
    /// a field left nil is kept, a blank one clears it; the flight's
    /// summary as it now stands comes back.
    static func updateFlight(_ id: Int, _ change: GWUpdateFlightRequest) async throws -> SavedFlight {
        try await send(SavedFlight.self, "PATCH", "/api/flights/\(id)", json: change)
    }

    static func deleteFlight(_ id: Int) async throws {
        try await send("DELETE", "/api/flights/\(id)")
    }
}
