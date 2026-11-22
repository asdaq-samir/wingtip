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

    /// Its details, and its flights and its base where `offered` says they
    /// are (Extra.airplaneHistory): with Other Airplanes on, asked beside
    /// its details; else only once its details show it is the pilot's own,
    /// and never for another's.
    func load(_ hex: String, offered: @MainActor (FlightDetail?) -> Bool) async {
        let detailFailed: Bool
        var basedFailed = false
        if offered(nil) {
            async let historyAsk = loadHistory(hex)
            detailFailed = await loadDetail(hex)
            basedFailed = await historyAsk
        } else {
            detailFailed = await loadDetail(hex)
            if offered(detail) { basedFailed = await loadHistory(hex) }
        }
        let failed = [detailFailed ? "its details" : nil, basedFailed ? "where it is based" : nil].compactMap { $0 }
        detailProblem = failed.isEmpty ? nil : "Not all of it could be had: \(failed.joined(separator: " and ")) missing."
    }

    /// Its details; whether they could not be had.
    private func loadDetail(_ hex: String) async -> Bool {
        do {
            detail = try await Planner.flight(hex)
            return false
        } catch {
            return true
        }
    }

    /// Its flights before and where it is based, asked together; whether
    /// the base could not be had.
    private func loadHistory(_ hex: String) async -> Bool {
        async let pastAsk = Planner.pastFlights(hex)
        async let basedAsk = Planner.based([hex])
        do {
            history = try await pastAsk
            flights = history?.flights ?? []
            problem = nil
        } catch {
            problem = Wording.pastFlightsNotFetched
        }
        do {
            based = try await basedAsk.based.additionalProperties[hex.lowercased()] ?? nil
            return false
        } catch {
            return true
        }
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
            problem = "Earlier flights could not be fetched: \(error.localizedDescription)"
        }
    }

    /// Its latest tower departure event, by the ident it files under.
    func tower(_ ident: String) async {
        guard ident.count >= 2 else { towerLine = nil; return }
        do {
            towerLine = LiveWords.departureLine(try await Planner.liveDepartures(ident).first)
        } catch {
            towerLine = nil
            nowProblem = "Its tower departures could not be fetched."
        }
    }

    /// Its flight number's scheduled route.
    func loadRoute(callsign: String, lat: Double?, lon: Double?) async {
        do {
            route = try await Planner.flightRoute(callsign: callsign, lat: lat, lon: lon)
        } catch {
            nowProblem = "Its scheduled route could not be fetched."
        }
    }
}
