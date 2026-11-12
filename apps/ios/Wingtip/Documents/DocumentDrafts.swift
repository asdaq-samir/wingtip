import Foundation
import FoundationModels

/// The shapes Apple's on-device model fills in when it reads a photographed
/// page on the phone (OnDeviceDocumentReader): member for member the
/// assistant's (services/assistant/app/documents/schemas.py, the engine's
/// handbook_read_check and logbook_read_check inputs), written to JSON in
/// snake case, so the engine checks the phone's read exactly as it checks
/// the server's, and the screens take either. Every figure is optional: a
/// figure the page does not show is left out, never filled in.
@Generable
struct PageNotes: Codable {
    @Guide(description: "Each figure that was hidden, blurred, cut off or ambiguous, and why; empty when none.")
    var notes: [String]
    @Guide(description: "Empty when the page could be read; otherwise why it could not, such as 'not a logbook page'.")
    var unreadable: String
}

@Generable
struct ClearanceDraft: Codable {
    @Guide(description: "The note as written, line by line, shorthand kept.")
    var written: String
    @Guide(description: "The same clearance as the controller said it, in words, figures as digits, nothing added.")
    var said: String
    var page: PageNotes
}

/// A clearance given as text: as the controller said it.
@Generable
struct ClearanceTextDraft {
    @Guide(description: "The clearance as the controller said it, in words, figures as digits, the places as written, nothing added.")
    var said: String
}

@Generable
struct LogbookRowDraft: Codable {
    @Guide(description: "YYYY-MM-DD; leave out where the day, month or year cannot be read.")
    var date: String?
    var aircraftType: String?
    var aircraftId: String?
    var from: String?
    var via: [String]?
    var to: String?
    @Guide(description: "Total flight time, hours and tenths, as written.")
    var total: Double?
    var crossCountry: Double?
    var night: Double?
    var instrumentActual: Double?
    var instrumentSimulated: Double?
    var dual: Double?
    var solo: Double?
    var dayLandings: Double?
    var nightLandings: Double?
    var approaches: Double?
    var holding: Bool?
    var remarks: String?
}

@Generable
struct PageTotalsDraft: Codable {
    var total: Double?
    var crossCountry: Double?
    var night: Double?
    var instrumentActual: Double?
    var instrumentSimulated: Double?
    var dual: Double?
    var solo: Double?
    var dayLandings: Double?
    var nightLandings: Double?
    var approaches: Double?
}

@Generable
struct LogbookPageDraft: Codable {
    @Guide(description: "Each flight written on the page, in the page's order.")
    var rows: [LogbookRowDraft]
    @Guide(description: "The page's 'total this page' row, where it has one; not the amounts forwarded nor the totals to date.")
    var pageTotals: PageTotalsDraft?
    var page: PageNotes
}

@Generable
struct CruiseRowDraft: Codable {
    var altitudeFt: Double?
    var rpm: Double?
    var powerPct: Double?
    var tas: Double?
    var burn: Double?
}

@Generable
struct DistanceRowDraft: Codable {
    var pressureAltitudeFt: Double?
    var tempC: Double?
    var groundRoll: Double?
    var overObstacle: Double?
}

@Generable
struct ClimbDraft: Codable {
    var speed: Double?
    var rateFpm: Double?
    var burn: Double?
}

@Generable
struct GlideDraft: Codable {
    var speed: Double?
    @Guide(description: "Feet forward for each foot down (9 for 9:1), only where the page states it.")
    var ratio: Double?
}

@Generable
struct EmptyDraft: Codable {
    var weight: Double?
    var arm: Double?
    var moment: Double?
    @Guide(description: "1000 where the column is moment/1000; 1 where it is the moment itself.")
    var momentDivisor: Double?
}

@Generable
struct CornerDraft: Codable {
    var arm: Double?
    var weight: Double?
}

@Generable
struct FuelDraft: Codable {
    var total: Double?
    var usable: Double?
}

@Generable
struct HandbookPageDraft: Codable {
    @Guide(description: "The speeds' unit as printed: kt or mph.")
    var speedUnit: String?
    @Guide(description: "What the cruise table's speeds are: tas, ias or cas.")
    var cruiseSpeedKind: String?
    @Guide(description: "ft or m.")
    var distanceUnit: String?
    @Guide(description: "lb or kg.")
    var weightUnit: String?
    @Guide(description: "in or mm.")
    var armUnit: String?
    @Guide(description: "gal or l.")
    var fuelUnit: String?
    @Guide(description: "gph, lph or pph.")
    var burnUnit: String?
    var cruise: [CruiseRowDraft]?
    var climb: ClimbDraft?
    var glide: GlideDraft?
    var takeoff: [DistanceRowDraft]?
    var landing: [DistanceRowDraft]?
    var empty: EmptyDraft?
    var maxTakeoffWeight: Double?
    var envelope: [CornerDraft]?
    var fuel: FuelDraft?
    var page: PageNotes
}
