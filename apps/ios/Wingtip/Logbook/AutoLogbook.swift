import Foundation
import Observation

/// The flight logged with no typing, "Flight Logged"'s model (the web's
/// features/logbook-auto/useAutoLogbook). When the engine, reading the
/// recorded track on the phone (FlightRecorder), finds the airplane has
/// landed and come to rest, the planner draws the entry with the fields
/// and approaches round the track (POST /api/logbook-draft, the engine's
/// logbook_from_track), and the pilot reviews it, changes what they like
/// and logs it (the gateway's POST /api/logbook): never saved unasked.
/// Logged, the currency is asked again (the engine's, from the logbook),
/// and the track goes to the saved flight it was flown as, for its debrief.
@MainActor
@Observable
final class AutoLogbook {
    static let shared = AutoLogbook()

    typealias Draft = APILogbookDraft

    /// What the pilot may change of the draft before it is logged.
    struct Edits: Equatable {
        var flownOn: String?
        var aircraft: String?
        var route: String?
        var remarks: String?
        var totalHours: Double?
        var nightHours: Double?
        var crossCountryHours: Double?
        var dayLandings: Int?
        var nightLandings: Int?
    }

    let recorder: FlightRecorder
    private(set) var draft: Draft?
    private(set) var drafting = false
    private(set) var draftProblem: String?
    var edits = Edits()
    /// 61.57(c)'s approaches and holds count only where flown by
    /// instruments, which no track shows (61.51(g)(1)): the pilot says so.
    var byInstruments = false
    private(set) var flights: [SavedFlight] = []
    /// The saved flight to debrief against: nil for the likeliest, .some(nil) for none.
    var picked: Int??
    private(set) var logging = false
    private(set) var logProblem: String?
    /// What was logged, for the sheet's last word.
    private(set) var logged: LogbookEntryRequest?

    init(recorder: FlightRecorder = .shared) {
        self.recorder = recorder
    }

    /// Open while a flight has ended and not been let go, and once logged.
    var isOpen: Bool { recorder.endedAt != nil || logged != nil }

    /// The saved flight the track is linked to.
    var linked: Int? {
        if let picked { return picked }
        return Self.likelyFlight(flights, route: edits.route ?? draft?.entry.route ?? "")?.id
    }

    /// The draft asked of the planner for the flight that ended, signed in.
    func draw(signedIn: Bool, tail: String?, type: String?) async {
        guard recorder.endedAt != nil, signedIn, recorder.points.count >= 2, draft == nil else { return }
        drafting = true
        defer { drafting = false }
        let ask = APILogbookDraftAsk(aircraft: tail, aircraftType: type, picked: nil,
                                     points: recorder.points.map { APIDraftTrackPoint(altFt: $0.altFt, lat: $0.lat, lon: $0.lon, t: $0.t) },
                                     utcOffsetMin: Double(TimeZone.current.secondsFromGMT()) / 60)
        do {
            // The ask's keys as the planner names them, some camel case,
            // each carried by the generated type.
            draft = try await Planner.call { try await $0.draft(body: .json(ask)).ok.body.json }
            draftProblem = nil
            flights = (try? await Gateway.flights()) ?? []
        } catch {
            draftProblem = error.localizedDescription
        }
    }

    /// The entry logged, its track put with the saved flight, the
    /// currency then asked again by `logbookChanged`.
    func log(logbookChanged: () -> Void) async {
        guard let draft else { return }
        logging = true
        defer { logging = false }
        let request = Self.entryRequest(draft, edits: edits, byInstruments: byInstruments, flightId: linked)
        do {
            try await Gateway.addLogbookEntry(request)
            if let flight = request.flightId {
                let track = SavedTrack(points: recorder.points.map { SavedTrackPoint(altFt: $0.altFt, lat: $0.lat, lon: $0.lon, t: Int($0.t)) },
                                       source: "Recorded by Wingtip")
                try? await Gateway.saveTrack(flight, track)
            }
            logged = request
            logProblem = nil
            reset()
            logbookChanged()
        } catch {
            logProblem = error.localizedDescription
        }
    }

    /// Not now: kept, and not offered again until a later landing.
    func later() {
        recorder.later()
        reset()
    }

    /// Not a flight to log: the track let go.
    func discard() {
        recorder.forget()
        reset()
    }

    /// The last word read.
    func close() { logged = nil }

    private func reset() {
        if logged != nil { recorder.forget() }
        draft = nil
        draftProblem = nil
        edits = Edits()
        byInstruments = false
        picked = nil
        flights = []
    }

    /// The entry the gateway keeps: the draft's columns with the pilot's
    /// changes, and 61.57(c)'s approaches, holding and tracking only where
    /// flown by instruments (the web's entryRequest).
    nonisolated static func entryRequest(_ draft: Draft, edits: Edits, byInstruments: Bool, flightId: Int?) -> LogbookEntryRequest {
        let e = draft.entry
        let aircraft = edits.aircraft ?? e.aircraft
        return LogbookEntryRequest(
            flownOn: edits.flownOn ?? e.flownOn, aircraft: aircraft?.isEmpty == true ? nil : aircraft, aircraftType: e.aircraftType,
            route: edits.route ?? e.route, remarks: edits.remarks ?? e.remarks,
            totalHours: edits.totalHours ?? e.totalHours, nightHours: edits.nightHours ?? e.nightHours,
            crossCountryHours: edits.crossCountryHours ?? e.crossCountryHours,
            dayLandings: edits.dayLandings ?? e.dayLandings, nightLandings: edits.nightLandings ?? e.nightLandings,
            toweredLandings: e.toweredLandings, distanceNm: e.distanceNm, longestLegNm: e.longestLegNm,
            approaches: byInstruments ? draft.instrument.approaches : 0,
            holding: byInstruments && draft.instrument.holding, tracking: byInstruments && draft.instrument.tracking,
            airHours: e.airHours, touchAndGoes: e.touchAndGoes, fromTrack: true, flightId: flightId)
    }

    /// The saved flight this one was most likely flown as: the newest
    /// whose ends are the route's (the web's likelyFlight).
    nonisolated static func likelyFlight(_ flights: [SavedFlight], route: String) -> SavedFlight? {
        let idents = route.split(separator: " ").map(String.init)
        guard let from = idents.first, let to = idents.last else { return nil }
        return flights.first { $0.departureIdent == from && $0.destinationIdent == to }
    }
}
