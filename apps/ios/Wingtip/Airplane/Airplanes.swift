import Foundation
import Observation
import OpenAPIRuntime

/// What the app knows of airplanes' figures, for every screen at once: the
/// types' book profiles (the planner's /api/aircraft-profiles, as sent)
/// and the signed-in pilot's airplane records. The figures themselves and
/// what one lacks are the engine's (airplane_figures, airplane_needs);
/// nothing here works a figure out or fills one in.
@MainActor
@Observable
final class Airplanes {
    static let shared = Airplanes()

    /// Each stock type's profile by its name, as the engine takes it.
    private(set) var books: [String: [String: OpenAPIValueContainer]] = [:]
    private(set) var booksLoaded = false
    /// The signed-in pilot's airplanes; none signed out.
    private(set) var records: [OwnAircraftRecord] = []
    @ObservationIgnored private var booksAsking = false

    /// The types' profiles, asked once a launch; asked again by the next
    /// screen that needs them where the planner did not answer.
    func loadBooks() async {
        guard !booksLoaded, !booksAsking else { return }
        booksAsking = true
        defer { booksAsking = false }
        do {
            books = try await Planner.aircraftBooks()
            booksLoaded = true
        } catch {
            Log.planner.notice("the airplane profiles could not be fetched: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The pilot's airplanes, asked again as they sign in or out; the last
    /// list stands where the gateway does not answer.
    func loadRecords(signedIn: Bool) async {
        guard signedIn else { records = []; return }
        if let list = try? await Gateway.aircraftRecords() { records = list }
    }

    func record(_ tail: String?) -> OwnAircraftRecord? {
        guard let tail = tail?.uppercased() else { return nil }
        return records.first { $0.tailNumber.uppercased() == tail }
    }

    /// A record as the gateway answered a save, in place of the old one.
    func took(_ record: OwnAircraftRecord) {
        records.removeAll { $0.id == record.id }
        records.append(record)
    }

    /// The record's photographed handbook page as airplane_figures takes it
    /// (handbook_figures' shape, `{"value"}` each): its usable fuel, the one
    /// planning figure the page keeps beside its tables.
    static func handbook(_ figures: GWHandbookFigures?) -> [String: OpenAPIValueContainer]? {
        guard let usable = figures?.usableFuelGal, let value = try? OpenAPIValueContainer(unvalidatedValue: ["value": usable]) else { return nil }
        return ["usableFuelGal": value]
    }

    /// The engine's airplane_figures; nil where it refuses, which it logs.
    static func answer(book: [String: OpenAPIValueContainer]?, handbook: [String: OpenAPIValueContainer]?, own: Figures?) -> EngineContract.AirplaneFiguresAnswer? {
        try? Engine.airplaneFigures(book: book, handbook: handbook, own: own?.engine)
    }

    /// The airplane the plan flies, its figures each with its source; nil
    /// with none picked, or while its type's book is not yet in (no figure
    /// is asked for that the book may have).
    func answer(for plan: Plan) -> EngineContract.AirplaneFiguresAnswer? {
        guard plan.airplaneChosen else { return nil }
        let book = books[plan.aircraft]
        if book == nil && plan.aircraft != Plan.ownAirplane { return nil }
        return Self.answer(book: book, handbook: Self.handbook(record(plan.tail)?.handbook), own: plan.figures)
    }

    /// One of the plan's airplane's figures, the book's under the pilot's.
    func value(_ figure: OwnFigure, plan: Plan) -> Double? {
        answer(for: plan)?.figures.first { $0.key == figure.rawValue }?.value
    }

    /// The inputs `need` lacks for the plan's airplane, by name
    /// (airplane_needs): ["airplane"] with none picked; none while its
    /// type's book is not yet in. Thrown where the engine cannot say, so
    /// the ask says that rather than reading as nothing missing.
    func missing(_ need: AirplaneNeed, plan: Plan) throws -> [String] {
        guard plan.airplaneChosen else { return ["airplane"] }
        guard let answer = answer(for: plan) else { return [] }
        return try Engine.airplaneNeeds(profile: answer.profile, figure: need.rawValue).missing
    }
}

extension Planner {
    /// The stock profiles as sent (/api/aircraft-profiles), by name: the
    /// book figures airplane_figures takes, glide and loading included.
    static func aircraftBooks() async throws -> [String: [String: OpenAPIValueContainer]] {
        // The profiles as the engine reads them, every member as sent:
        // the generated AircraftProfile written out again as JSON.
        var out: [String: [String: OpenAPIValueContainer]] = [:]
        for profile in try await aircraftProfiles() {
            out[profile.name] = try Engine.recoded(profile, encoder: JSONEncoder(), decoder: JSONDecoder())
        }
        return out
    }
}
