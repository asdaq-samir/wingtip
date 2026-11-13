import Foundation
import Observation

/// The airplane card's view model (AirplaneCard, MVVM): what the planner
/// has of an airplane by its ICAO address -- its details, its flights
/// before, where it is based, its scheduled route and its latest tower
/// departure -- each fetched here, and each failure said where it would
/// have shown (ProblemLine) rather than the section left looking empty.
@MainActor
@Observable
final class AirplaneCardModel {
    private(set) var detail: FlightDetail?
    private(set) var route: FlightRoute?
    private(set) var flights: [PastFlightSummary] = []
    private(set) var history: PastFlights?
    private(set) var based: PastFlightField?
    private(set) var fetchingMore = false
    /// Its latest tower departure event in a line (LiveWords.departureLine).
    private(set) var towerLine: String?
    /// The past flights' failure, under them.
    private(set) var problem: String?
    /// Its details' or its base's failure, under the Airplane section.
    private(set) var detailProblem: String?
    /// The scheduled route's or the tower's failure, under Now.
    private(set) var nowProblem: String?

    /// Its details, its flights and its base, asked together.
    func load(_ hex: String) async {
        async let detailAsk = Planner.flight(hex)
        async let pastAsk = Planner.pastFlights(hex)
        async let basedAsk = Planner.based([hex])
        var failed: [String] = []
        do { detail = try await detailAsk } catch { failed.append("its details") }
        do {
            history = try await pastAsk
            flights = history?.flights ?? []
            problem = nil
        } catch {
            problem = "Its past flights could not be had. Try again in a moment."
        }
        do { based = try await basedAsk.based.additionalProperties[hex.lowercased()] ?? nil } catch { failed.append("where it is based") }
        detailProblem = failed.isEmpty ? nil : "Not all of it could be had: \(failed.joined(separator: " and ")) missing."
    }

    /// Ten more, before the last listed, as far back as the archive goes.
    func more(_ hex: String) async {
        guard let until = history?.nextUntil else { return }
        fetchingMore = true
        defer { fetchingMore = false }
        do {
            let page = try await Planner.pastFlights(hex, until: until, before: flights.last?.off)
            history = page
            flights += page.flights.filter { f in !flights.contains { $0.id == f.id } }
        } catch {
            problem = "Earlier flights could not be had: \(error.localizedDescription)"
        }
    }

    /// Its latest tower departure event, by the ident it files under.
    func tower(_ ident: String) async {
        guard ident.count >= 2 else { towerLine = nil; return }
        do {
            towerLine = LiveWords.departureLine(try await Planner.liveDepartures(ident).first)
        } catch {
            towerLine = nil
            nowProblem = "Its tower departures could not be had."
        }
    }

    /// Its flight number's scheduled route.
    func loadRoute(callsign: String, lat: Double?, lon: Double?) async {
        do {
            route = try await Planner.flightRoute(callsign: callsign, lat: lat, lon: lon)
        } catch {
            nowProblem = "Its scheduled route could not be had."
        }
    }
}
