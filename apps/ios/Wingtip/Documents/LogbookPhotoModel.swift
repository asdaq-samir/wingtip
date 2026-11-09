import Observation
import UIKit

/// The logbook's "Add from a Photo": a paper logbook page read, a row for
/// each flight on it with the engine's flags (logbook_read_check, 14 CFR
/// 61.51), and only the rows the pilot confirms logged, one by one, as the
/// form logs a flight.
@MainActor
@Observable
final class LogbookPhotoModel {
    let reader = DocumentReadModel()
    private(set) var check: ASLogbookCheck?
    /// The rows confirmed, by their place on the page.
    private(set) var confirmed: Set<Int> = []
    /// The rows already logged, so a second try after a failure does not
    /// log one twice.
    private(set) var logged: Set<Int> = []
    private(set) var saving = false
    var problem: String?
    var reviewing = false

    var notes: DocumentRead? { reader.answer?.read }
    var rows: [ASLogbookRowCheck] { check?.rows ?? [] }
    /// The rows to log on the next tap.
    var toLog: [Int] { confirmed.subtracting(logged).sorted() }

    func read(_ image: UIImage) {
        reader.read(.logbookPage, image: image) { [weak self] answer in self?.take(answer) }
    }

    func take(_ answer: DocumentAnswer) {
        check = answer.read.logbookCheck
        confirmed = []
        logged = []
        problem = nil
        reviewing = true
    }

    /// A row can be logged only with its date: the logbook's entry needs
    /// the day flown (14 CFR 61.51(b)(1)(i)).
    static func canConfirm(_ row: ASLogbookRowCheck) -> Bool { row.entry.flownOn != nil }

    func isConfirmed(_ i: Int) -> Bool { confirmed.contains(i) }

    func setConfirmed(_ i: Int, _ on: Bool) {
        guard rows.indices.contains(i), Self.canConfirm(rows[i]), !logged.contains(i) else { return }
        if on { confirmed.insert(i) } else { confirmed.remove(i) }
    }

    /// The gateway's entry for a row, every figure the page does not give
    /// nought; nil for a row with no date.
    static func request(_ e: ASLogbookEntryDraft) -> LogbookEntryRequest? {
        guard let day = e.flownOn else { return nil }
        return LogbookEntryRequest(
            flownOn: day, aircraft: e.aircraft, aircraftType: e.aircraftType, route: e.route, remarks: e.remarks,
            totalHours: e.totalHours ?? 0, nightHours: e.nightHours ?? 0, crossCountryHours: e.crossCountryHours ?? 0,
            dualHours: e.dualHours ?? 0, soloHours: e.soloHours ?? 0, instrumentHours: e.instrumentHours ?? 0,
            dayLandings: e.dayLandings ?? 0, nightLandings: e.nightLandings ?? 0, toweredLandings: e.toweredLandings ?? 0,
            distanceNm: e.distanceNm ?? 0, longestLegNm: e.longestLegNm ?? 0, approaches: e.approaches ?? 0,
            holding: e.holding ?? false, tracking: e.tracking ?? false, airHours: e.airHours ?? 0,
            touchAndGoes: e.touchAndGoes ?? 0, fromTrack: e.fromTrack ?? false, flightId: e.flightId)
    }

    /// The confirmed rows logged one by one, through `add` (the gateway's
    /// POST /api/logbook); true when every one went in. The first that is
    /// refused stops the rest, and says which.
    func logConfirmed(_ add: (LogbookEntryRequest) async throws -> Void) async -> Bool {
        saving = true
        defer { saving = false }
        problem = nil
        for i in toLog {
            guard let request = Self.request(rows[i].entry) else { continue }
            do {
                try await add(request)
                logged.insert(i)
            } catch {
                problem = "Flight \(i + 1) couldn't be logged: \(error.localizedDescription)"
                return false
            }
        }
        return true
    }

    func close() {
        reviewing = false
        reader.cancel()
    }
}
