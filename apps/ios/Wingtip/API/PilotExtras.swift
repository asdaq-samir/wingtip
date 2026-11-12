import Foundation
import SwiftUI

// The pilot's own records on the gateway, past what Pilot.swift reads:
// their airplanes with squawks, inspections and VOR checks,
// the logbook written to, the account's contact and its deletion, and the
// instructor's side of training. Each model is the gateway's, generated
// from services/gateway/openapi.json (WingtipAPI/GatewayAPI, the
// GW prefix) in its own camelCase names; dates are the "2026-10-25"
// strings it sends. Every rule (61.57's windows, 91.171's limits, 91.409's
// months) is worked out by the gateway; the app shows its answers.

/// One of the pilot's airplanes in full (AircraftDto): the figures the
/// nav log flies it on, its flight plan items, and the gateway's record
/// of its inspections, open squawks and last VOR check.
typealias OwnAircraftRecord = GWAircraftDto

extension OwnAircraftRecord: @retroactive Identifiable {}

/// The inspections as the owner records them, with the last day each is
/// good for as the gateway works it out (InspectionsDto): the annual
/// (14 CFR 91.409(a)), the 100-hour (91.409(b), owed only for an airplane
/// flown for hire), the altimeter and static (91.411), the transponder
/// (91.413) and the ELT (91.207(c), (d)).
typealias Inspections = GWInspectionsDto

/// What the inspections' form saves (InspectionsRequest): a blank is null.
typealias InspectionsRequest = GWInspectionsRequest

extension InspectionsRequest {
    init(_ i: Inspections?) {
        self.init(annualOn: i?.annualOn, eltBatteryDueOn: i?.eltBatteryDueOn, eltInspectedOn: i?.eltInspectedOn, forHire: i?.forHire ?? false,
                  hoursNow: i?.hoursNow, hundredHourAtHours: i?.hundredHourAtHours, staticCheckOn: i?.staticCheckOn,
                  transponderCheckOn: i?.transponderCheckOn)
    }
}

/// A squawk (SquawkDto): open until fixed; an inoperative instrument or
/// equipment carries the kinds of flight its 14 CFR 91.213(d)
/// determination covers.
typealias Squawk = GWSquawkDto

extension Squawk: @retroactive Identifiable {
    var request: SquawkRequest {
        SquawkRequest(deferredFor: deferredFor, fixedOn: fixedOn, fixNote: fixNote, inoperative: inoperative, reportedOn: reportedOn, text: text)
    }
}

typealias SquawkRequest = GWSquawkRequest

/// The kinds of flight a 91.213(d) determination can be made for, in the
/// rule's order (91.205(b)-(d)), as the web app's SquawksPage words them.
enum Deferral {
    static let reaches: [(value: String?, label: String)] = [
        (nil, "Not deferred"),
        ("VFR_DAY", "Deferred for VFR by day"),
        ("VFR", "Deferred for VFR, day and night"),
        ("ALL", "Deferred for every kind"),
    ]

    /// How an open squawk stands: nothing for one that leaves the
    /// equipment working.
    static func standing(_ s: Squawk) -> String? {
        guard s.inoperative else { return nil }
        guard let to = s.deferredFor else { return "Inoperative, not deferred" }
        return reaches.first { $0.value == to }?.label ?? to
    }
}

/// The airplane's last VOR check for IFR (VorCheckDto, 14 CFR 91.171):
/// the gateway gives the limit for its kind and the last day it is good
/// for, 30 days on (91.171(a)(2)).
typealias VorCheck = GWVorCheckDto

typealias VorCheckRequest = GWVorCheckRequest

/// The ways a VOR is checked for IFR (14 CFR 91.171(b), (c)): 4 degrees at
/// a VOT or a repair station's test signal (91.171(b)(1)) or a ground
/// checkpoint (91.171(b)(2)), 6 at an airborne checkpoint (91.171(b)(3))
/// or on an airway's radial in flight (91.171(b)(4)), and 4 between two
/// receivers (91.171(c)); the error each allows is the engine's
/// (`vor_check_limit_deg`). The gateway judges the check by its own limitDeg.
enum VorCheckKind {
    static let all: [(value: String, label: String)] = [
        ("VOT", "VOT"),
        ("REPAIR_STATION", "Repair station signal"),
        ("GROUND", "Ground checkpoint"),
        ("AIRBORNE", "Airborne checkpoint"),
        ("RADIAL", "Airway radial in flight"),
        ("DUAL", "Dual receivers"),
    ]

    /// The largest bearing error 91.171 allows for a kind of check; thrown
    /// where the engine cannot say.
    static func limitDeg(_ kind: String) throws -> Double {
        try Engine.vorCheckLimitDeg(kind: kind)
    }

    static func label(_ kind: String) -> String { all.first { $0.value == kind }?.label ?? kind }
}

/// An airplane's checklist as the engine reads it from the pilot's text
/// (ChecklistText), the same shape the watch is sent (WatchChecklist).
/// It is kept on the device as text (LocalChecklists), not on the gateway.
typealias Checklist = EngineContract.Checklist

extension Checklist {
    /// The engine's reading of the text (`checklist_read`), as a checklist
    /// it writes back: the same members by name.
    init(_ read: EngineContract.ChecklistRead) {
        self.init(sections: read.sections.map { s in
            .init(title: s.title, items: s.items.map { .init(challenge: $0.challenge, response: $0.response) })
        })
    }
}

/// The airplane as the form saves it (AircraftRequest).
typealias AircraftRequest = GWAircraftRequest

/// A flight logged (LogbookEntryRequest): a paper logbook's columns.
typealias LogbookEntryRequest = GWLogbookEntryRequest

extension LogbookEntryRequest {
    /// A new flight's form: today, one landing by day, the airplane flown.
    static func blank(aircraft: String?) -> LogbookEntryRequest {
        LogbookEntryRequest(flownOn: Day.today(), aircraft: aircraft, dayLandings: 1)
    }

    /// The form's fields in a paper logbook's order, every figure nought
    /// where not given.
    init(flownOn: String, aircraft: String? = nil, aircraftType: String? = nil, route: String? = nil, remarks: String? = nil,
         totalHours: Double = 0, nightHours: Double = 0, crossCountryHours: Double = 0, dualHours: Double = 0, soloHours: Double = 0,
         instrumentHours: Double = 0, dayLandings: Int = 0, nightLandings: Int = 0, toweredLandings: Int = 0,
         distanceNm: Double = 0, longestLegNm: Double = 0, approaches: Int = 0, holding: Bool = false, tracking: Bool = false,
         airHours: Double = 0, touchAndGoes: Int = 0, fromTrack: Bool = false, flightId: Int? = nil) {
        self.init(aircraft: aircraft, aircraftType: aircraftType, airHours: airHours, approaches: approaches,
                  crossCountryHours: crossCountryHours, dayLandings: dayLandings, distanceNm: distanceNm, dualHours: dualHours,
                  flightId: flightId, flownOn: flownOn, fromTrack: fromTrack, holding: holding,
                  instrumentHours: instrumentHours, longestLegNm: longestLegNm, nightHours: nightHours, nightLandings: nightLandings,
                  remarks: remarks, route: route, soloHours: soloHours, totalHours: totalHours, touchAndGoes: touchAndGoes,
                  toweredLandings: toweredLandings, tracking: tracking)
    }

    /// An entry as its form opens it.
    init(_ e: LogbookEntry) {
        self.init(flownOn: e.flownOn, aircraft: e.aircraft, aircraftType: e.aircraftType, route: e.route, remarks: e.remarks,
                  totalHours: e.totalHours, nightHours: e.nightHours, crossCountryHours: e.crossCountryHours,
                  dualHours: e.dualHours, soloHours: e.soloHours, instrumentHours: e.instrumentHours,
                  dayLandings: e.dayLandings, nightLandings: e.nightLandings, toweredLandings: e.toweredLandings,
                  distanceNm: e.distanceNm, longestLegNm: e.longestLegNm, approaches: e.approaches,
                  holding: e.holding, tracking: e.tracking, airHours: e.airHours, touchAndGoes: e.touchAndGoes,
                  fromTrack: e.fromTrack, flightId: e.flightId)
    }

    /// Blank words sent as null, not as "".
    var trimmed: LogbookEntryRequest {
        var out = self
        func blankNil(_ s: String?) -> String? { let t = (s ?? "").trimmingCharacters(in: .whitespaces); return t.isEmpty ? nil : t }
        out.aircraft = blankNil(aircraft); out.aircraftType = blankNil(aircraftType); out.route = blankNil(route); out.remarks = blankNil(remarks)
        return out
    }
}

/// The dates the pilot gives the currency (CurrencyDatesRequest).
typealias CurrencyDatesRequest = GWCurrencyDatesRequest

typealias Reminders = GWRemindersDto

typealias LogbookImportResult = GWLogbookImportResult

/// What falls due for the pilot and their airplanes, soonest first, each
/// with its rule and the days or hours left (GET /api/paperwork, the
/// gateway's PaperworkService): the Logbook's Coming Up, and the list the
/// reminder emails are made from.
typealias Paperwork = GWPaperworkDto
typealias Due = GWDueDto

extension Due {
    /// One row, unique in the list.
    var key: String { "\(what)-\(aircraftId ?? 0)-\(itemId ?? 0)" }

    /// The airplane's tail before its own items.
    var named: String { tailNumber.map { "\($0) · \(title)" } ?? title }

    /// "In 22 days", "Today", "3 days past"; by hours where it has no day:
    /// "19.5 h to go", "Due now".
    var when: String {
        if let d = daysLeft {
            switch d {
            case 0: return "Today"
            case 1: return "Tomorrow"
            case -1: return "Yesterday"
            default: return d > 1 ? "In \(d) days" : "\(-d) days past"
            }
        }
        if let h = hoursLeft { return h > 0 ? "\(Format.hours(h)) to go" : "Due now" }
        return dueAtHours.map { "At \(Format.hours($0))" } ?? ""
    }

    /// How near it falls due, the engine's (`due_tone`: past, within the
    /// reminders' 30 days or 10 hours, further off), in the app's inks;
    /// plain where the engine cannot say, the refusal logged.
    var tone: Color {
        do {
            switch try Engine.dueTone(daysLeft: daysLeft.map(Double.init), hoursLeft: hoursLeft) {
            case "stop": return WingtipInk.problem
            case "caution": return WingtipInk.caution
            case "ok": return WingtipInk.go
            default: return .secondary
            }
        } catch {
            Log.engine.error("due_tone: \(error.localizedDescription, privacy: .public)")
            return .secondary
        }
    }
}

/// An AC 61-65K endorsement as the gateway offers it to sign
/// (EndorsementKindDto): its words with blanks, the paragraph and the
/// 14 CFR section it comes from.
typealias EndorsementKind = GWEndorsementKindDto
typealias EndorsementField = GWEndorsementFieldDto

extension EndorsementKind: @retroactive Identifiable {
    public var id: String { code }
}

/// An endorsement recorded from paper (EndorsementDto): the day it was
/// signed, and the day it runs to where it runs out.
typealias RecordedEndorsement = GWEndorsementDto

/// The instructor's own record (InstructorDto): their certificate as
/// endorsements print it, who asks them in, their students, the solo
/// cross-countries put to them and what they signed.
typealias Instructor = GWInstructorDto
typealias StudentRow = GWStudentDto

extension StudentRow: @retroactive Identifiable {
    public var id: Int { linkId }
}

typealias InstructorRequest = GWInstructorRequest
typealias SignRequest = GWSignRequest
typealias AskReviewRequest = GWAskReviewRequest

extension Gateway {
    // The airplanes.
    static func aircraftRecords() async throws -> [OwnAircraftRecord] { try await read { try await $0.getAircraft().ok.body.json } ?? [] }
    static func addAircraft(_ r: AircraftRequest) async throws -> OwnAircraftRecord { try await call { try await $0.postAircraft(body: .json(r)).ok.body.json } }
    static func updateAircraft(_ id: Int, _ r: AircraftRequest) async throws -> OwnAircraftRecord {
        try await call { try await $0.putAircraftId(path: .init(id: id), body: .json(r)).ok.body.json }
    }
    static func deleteAircraft(_ id: Int) async throws { _ = try await call { try await $0.deleteAircraftId(path: .init(id: id)) } }
    static func saveInspections(_ id: Int, _ r: InspectionsRequest) async throws -> OwnAircraftRecord {
        try await call { try await $0.inspections(path: .init(id: id), body: .json(r)).ok.body.json }
    }
    static func squawks(_ id: Int) async throws -> [Squawk] { try await call { try await $0.squawks(path: .init(id: id)).ok.body.json } }
    static func addSquawk(_ id: Int, _ r: SquawkRequest) async throws -> Squawk {
        try await call { try await $0.addSquawk(path: .init(id: id), body: .json(r)).ok.body.json }
    }
    static func updateSquawk(_ id: Int, _ squawk: Int, _ r: SquawkRequest) async throws -> Squawk {
        try await call { try await $0.updateSquawk(path: .init(id: id, squawkId: squawk), body: .json(r)).ok.body.json }
    }
    static func deleteSquawk(_ id: Int, _ squawk: Int) async throws { _ = try await call { try await $0.deleteSquawk(path: .init(id: id, squawkId: squawk)) } }
    static func recordVorCheck(_ id: Int, _ r: VorCheckRequest) async throws -> OwnAircraftRecord {
        try await call { try await $0.vorCheck(path: .init(id: id), body: .json(r)).ok.body.json }
    }

    // The logbook.
    static func addLogbookEntry(_ r: LogbookEntryRequest) async throws { _ = try await call { try await $0.postLogbook(body: .json(r.trimmed)) } }
    static func updateLogbookEntry(_ id: Int, _ r: LogbookEntryRequest) async throws {
        _ = try await call { try await $0.putLogbookId(path: .init(id: id), body: .json(r.trimmed)) }
    }
    static func deleteLogbookEntry(_ id: Int) async throws { _ = try await call { try await $0.deleteLogbookId(path: .init(id: id)) } }
    static func setCurrencyDates(_ r: CurrencyDatesRequest) async throws -> Currency { try await call { try await $0.setCurrencyDates(body: .json(r)).ok.body.json } }
    static func reminders() async throws -> Reminders? { try await read { try await $0.reminders().ok.body.json } }
    static func setReminders(_ on: Bool) async throws -> Reminders { try await call { try await $0.setReminders(body: .json(Reminders(on: on))).ok.body.json } }
    static func paperwork() async throws -> Paperwork? { try await read { try await $0.due().ok.body.json } }
    /// A large body, given the upload's time.
    static func importLogbook(_ entries: [LogbookEntryRequest]) async throws -> LogbookImportResult {
        try await call(.upload) { try await $0.importAll(body: .json(GWLogbookImportRequest(entries: entries))).ok.body.json }
    }

    // The account.
    static func setContact(phone: String?, homeBase: String?) async throws -> Pilot {
        try await call { try await $0.setContact(body: .json(GWPilotContactRequest(homeBase: homeBase, phone: phone))).ok.body.json }
    }
    /// Everything that was the pilot's, and every session they hold
    /// (DELETE /api/me, 204); a 502 deleted nothing.
    static func deleteAccount() async throws { _ = try await call { try await $0.deleteMe() } }

    // The student's side of training.
    static func setTrainingName(_ name: String) async throws -> Training {
        try await call { try await $0.setName(body: .json(GWFullNameRequest(fullName: name))).ok.body.json }
    }
    static func setKnowledgeTest(_ codes: [String]) async throws -> Training {
        try await call { try await $0.setKnowledgeTest(body: .json(GWKnowledgeTestRequest(codes: codes))).ok.body.json }
    }
    /// An endorsement signed on paper, recorded by its day; nil takes it off.
    static func recordEndorsement(_ code: String, on day: String?) async throws -> Training {
        if let day { return try await call { try await $0.endorse(path: .init(code: code), body: .json(GWEndorsementRequest(endorsedOn: day))).ok.body.json } }
        return try await call { try await $0.withdraw(path: .init(code: code)).ok.body.json }
    }
    static func dropInstructor(_ id: Int) async throws -> Training { try await call { try await $0.dropInstructor(path: .init(id: id)).ok.body.json } }
    static func askReview(_ r: AskReviewRequest) async throws -> Training { try await call { try await $0.askReview(body: .json(r)).ok.body.json } }
    static func withdrawReview(_ id: Int) async throws -> Training { try await call { try await $0.withdrawReview(path: .init(id: id)).ok.body.json } }

    // The instructor's side.
    static func instructor() async throws -> Instructor? { try await read { try await $0.getInstructor().ok.body.json } }
    static func setInstructor(_ r: InstructorRequest) async throws -> Instructor { try await call { try await $0.set(body: .json(r)).ok.body.json } }
    static func stopInstructing() async throws -> Instructor { try await call { try await $0.deleteInstructor().ok.body.json } }
    static func acceptStudent(_ linkId: Int) async throws -> Instructor { try await call { try await $0.accept(path: .init(linkId: linkId)).ok.body.json } }
    static func leaveStudent(_ linkId: Int) async throws -> Instructor { try await call { try await $0.leave(path: .init(linkId: linkId)).ok.body.json } }
    static func voidEndorsement(_ id: Int) async throws -> Instructor { try await call { try await $0.voidEndorsement(path: .init(id: id)).ok.body.json } }
    static func declineReview(_ id: Int, note: String) async throws -> Instructor {
        try await call { try await $0.decline(path: .init(id: id), body: .json(GWDeclineRequest(note: note))).ok.body.json }
    }
    static func studentTraining(_ studentId: Int) async throws -> Training { try await call { try await $0.student(path: .init(studentId: studentId)).ok.body.json } }
    static func sign(_ studentId: Int, _ r: SignRequest) async throws -> Training {
        try await call { try await $0.sign(path: .init(studentId: studentId), body: .json(r)).ok.body.json }
    }
}
