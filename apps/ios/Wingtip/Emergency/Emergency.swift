import CoreLocation
import Foundation
import Observation
import PlannerAPI

/// The emergency assistant's one model (the web's useEmergency): the
/// fields within a glide ranked by the engine's best_fields from the
/// planner's /api/emergency/fields, the field picked and its line on the
/// map, the airplane's own emergency checklist opened at the emergency
/// asked (checklist_section), and the MAYDAY filled from all of it
/// (mayday_call). Opened with no map button of its own
/// (docs/decisions/0010): from the instruments bar in flight, the pilot's
/// words ("mayday", "engine failure", "emergency") and the emergency
/// checklist. Nothing here weighs a field or words a call.
@MainActor
@Observable
final class Emergency {
    /// Where it was opened from.
    enum From: String, Identifiable, Sendable {
        case flying, voice, checklist, link
        var id: String { rawValue }
    }

    typealias Ranked = EngineContract.BestFieldsAnswer
    typealias Field = EngineContract.BestField
    typealias Mayday = EngineContract.MaydayCallAnswer

    var open: From?
    private(set) var answer: APIEmergencyFields?
    private(set) var ranked: Ranked?
    private(set) var problem: String?
    private(set) var asking = false
    /// Where the fields came from: the planner's, with their weather,
    /// runways and frequencies, or this iPhone's cycle packs, without
    /// (deviceFields), which the list then says.
    private(set) var from: Planner.FieldsFrom = .planner
    /// The field picked; the engine's first until one is.
    var pickedIdent: String?
    /// The emergency checklist's section picked; checklist_section's until one is.
    var sectionPicked: Int?
    /// What the pilot tells the screen: who is on board, the fuel left.
    var souls = ""
    var fuelMin = ""
    @ObservationIgnored private var askedKey: String?

    /// The phase the checklist opens at (GAMA Specification No. 1,
    /// Section 3; the engine's EMERGENCY_PHASES).
    static let engineFailure = "Engine failure in flight"

    var picked: Field? { ranked?.fields.first { $0.ident == pickedIdent } ?? ranked?.fields.first }
    var pickedPhone: String? { answer?.fields.first { $0.ident == picked?.ident }?.phone }

    func close() {
        open = nil
        pickedIdent = nil
        sectionPicked = nil
    }

    /// The question's key: asked again as the airplane moves on about half
    /// a mile (a hundredth of a degree, about what a light single glides in
    /// twenty seconds) or comes down 500 ft, not at each fix.
    static func key(_ fix: OwnShip.Fix, aircraft: String?, glideRatio: Double? = nil) -> String {
        let at = { (deg: Double) in Int((deg / 0.01).rounded()) }
        let alt = fix.altitudeFt.map { Int(($0 / 500).rounded()) } ?? -1
        return "\(at(fix.coordinate.latitude)),\(at(fix.coordinate.longitude)),\(alt),\(aircraft ?? ""),\(glideRatio ?? 0)"
    }

    /// The fields round the airplane, asked where the key changed, and
    /// ranked by the engine at every fix. The pilot's own glide ratio goes
    /// with the airplane, over its type's (or alone, for an own airplane of
    /// no stock type). With no answer from the planner in inFlight's five
    /// seconds, the fields are the packs' round where the airplane is now
    /// (deviceFields), never an old list from miles back.
    func refresh(fix: OwnShip.Fix?, aircraft: String?, glideRatio: Double? = nil, pins: PackFields.Pins = FlightFigures.packPins) async {
        guard open != nil, let fix else { return }
        let key = Self.key(fix, aircraft: aircraft, glideRatio: glideRatio)
        if key != askedKey {
            asking = true
            defer { asking = false }
            do {
                let asked = Operations.EmergencyFields.Input.Query(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude,
                                                                   altitudeFt: fix.altitudeFt?.rounded(), aircraft: aircraft, glideRatio: glideRatio)
                answer = try await Planner.call(.inFlight) { try await $0.emergencyFields(query: asked).ok.body.json }
                askedKey = key
                from = .planner
                problem = nil
            } catch {
                guard !Task.isCancelled else { return }
                do {
                    if let kept = try Self.deviceFields(fix: fix, aircraft: aircraft, glideRatio: glideRatio, pins: pins) {
                        answer = kept
                        from = .device
                        askedKey = key
                        problem = nil
                    } else if answer == nil || from == .device {
                        answer = nil
                        ranked = nil
                        problem = "No fields: the planner didn't answer and no chart data is kept on this iPhone here. Keep the route for the air before you fly."
                    }
                } catch {
                    problem = "The fields couldn't be ranked on this iPhone: \(error.localizedDescription)"
                }
            }
        }
        rank(fix)
    }

    func rank(_ fix: OwnShip.Fix) {
        guard let answer else { return }
        do {
            ranked = try Self.bestFields(answer, fix: fix, variationDeg: Self.variation(at: fix.coordinate))
        } catch {
            problem = "The fields couldn't be ranked: \(error.localizedDescription)"
        }
    }

    /// The fields round the airplane from the cycle packs kept on the phone
    /// (PackFields), as the planner's answer is read: each one's distance
    /// and true course the engine's best_fields', and no elevation, runway,
    /// METAR, frequency or phone, which the packs do not hold. The airplane
    /// is the pilot's own glide ratio alone (its POH's Section 3, as the
    /// planner sends an own airplane's), with no best-glide speed or wind,
    /// so the engine works the reach in still air only where it can; none
    /// with no airplane picked or no ratio, and the nearest come first.
    /// Nil where no pack is kept round the airplane.
    static func deviceFields(fix: OwnShip.Fix, aircraft: String?, glideRatio: Double?, pins: PackFields.Pins) throws -> APIEmergencyFields? {
        let at = fix.coordinate
        guard let kept = try PackFields.ranked(lat: at.latitude, lon: at.longitude, altitudeFt: fix.altitudeFt, speedKt: fix.groundspeedKt,
                                               limit: 12, pins: pins), !kept.pins.isEmpty else { return nil }
        let byIdent = Dictionary(kept.pins.map { ($0.ident, $0) }, uniquingKeysWith: { a, _ in a })
        let fields = kept.ranked.fields.map { field in
            APIEmergencyField(bearingDeg: field.courseDeg, distanceNm: field.distanceNm, elevationFt: nil, frequencies: nil, ident: field.ident,
                              lat: field.lat, lon: field.lon, metar: nil, military: byIdent[field.ident]?.military != nil, name: field.name,
                              phone: nil, isPrivate: field.private, runways: [], towered: field.towered)
        }
        let airplane = aircraft.flatMap { name in
            glideRatio.map { APIEmergencyAirplane(glide: APIGlideFigures(ratio: $0, source: "The pilot's own figure, from the airplane's handbook"), name: name) }
        }
        return APIEmergencyFields(airplane: airplane, fields: fields, wind: nil)
    }

    /// What to do with no airplane picked (the owner, 2026-11-09): the
    /// engine's emergency_guidance, each item with its source (AIM 6-1,
    /// 6-2, 6-3; FAA-H-8083-3C ch. 18); nil with one picked, whose own
    /// checklist shows instead. Never an airplane's checklist or figure.
    /// Thrown where the engine cannot answer, said where the guidance goes
    /// rather than shown as an empty list.
    static func guidance(airplaneChosen: Bool) throws -> [EngineContract.EmergencyGuidanceAnswerItemsItem]? {
        airplaneChosen ? nil : try Engine.emergencyGuidance().items
    }

    /// Magnetic variation at a point today, east positive (the engine's WMM).
    static func variation(at: CLLocationCoordinate2D, on day: Date = Date()) -> Double? {
        try? Engine.magneticVariation(lat: at.latitude, lon: at.longitude, date: String(ISO8601DateFormatter().string(from: day).prefix(10)))
    }

    /// The fields ranked from the airplane in "glide" mode, the airplane's
    /// figures as the planner sent them (none: the glide is not guessed).
    /// The planner's members are the engine's, in its snake case.
    static func bestFields(_ answer: APIEmergencyFields, fix: OwnShip.Fix, variationDeg: Double?) throws -> Ranked {
        let snake = Planner.snakeEncoder
        return try Engine.bestFields(
            mode: "glide",
            at: .init(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude),
            altitudeFt: fix.altitudeFt, speedKt: fix.groundspeedKt,
            wind: try answer.wind.map { try Engine.recoded($0, encoder: snake) },
            variationDeg: variationDeg,
            airplane: try answer.airplane.map { try Engine.recoded($0, encoder: snake) },
            fields: try answer.fields.map { try Engine.recoded($0, encoder: snake) })
    }

    /// The section of the emergency checklist asked, "Engine failure in
    /// flight" by default (the engine's checklist_section); nil where none;
    /// thrown where the engine cannot say, which the checklist then says.
    static func section(_ titles: [String], want: String = engineFailure) throws -> Int? {
        try Engine.checklistSection(titles: titles, want: want).map { Int($0) }
    }

    /// Where the airplane is as a controller gives it, off the nearest
    /// field: "3 nm SW of Grand Geneva Resort" (the reciprocal of the
    /// bearing to it). A VOR's radial and distance, the web's first choice,
    /// needs the navaids in view, which the phone does not keep yet.
    static func positionWords(_ nearest: APIEmergencyField?) -> String? {
        guard let nearest else { return nil }
        return "\(Int(nearest.distanceNm.rounded())) nm \(AirportWords.compassPoint(nearest.bearingDeg + 180)) of \(nearest.name)"
    }

    /// The airplane's track, magnetic: the true less an easterly variation
    /// ("east is least", FAA-H-8083-25C, chapter 16).
    static func magnetic(_ trueDeg: Double?, variationDeg: Double?) -> Double? {
        guard let trueDeg, let variationDeg else { return nil }
        let deg = (trueDeg - variationDeg).truncatingRemainder(dividingBy: 360)
        return deg < 0 ? deg + 360 : deg
    }

    /// The call, filled from what the screen knows; a part not known is
    /// left for the pilot to say. The fields' ATC frequencies, each with
    /// its field's distance, are the ones the engine picks from.
    func mayday(fix: OwnShip.Fix?, tail: String?, nature: String) throws -> Mayday {
        let variation = fix.flatMap { Self.variation(at: $0.coordinate) }
        let frequencies = (answer?.fields ?? []).flatMap { f in
            (f.frequencies ?? []).map { EngineContract.MaydayCallInputFrequenciesItem(ident: f.ident, kind: $0.kind, mhz: $0.mhz, distanceNm: f.distanceNm) }
        }
        return try Engine.maydayCall(
            station: nil, callsign: tail, airplaneType: answer?.airplane?.type, nature: nature, weather: nil,
            intentions: picked.map { "Landing at \($0.name), \($0.ident)" },
            position: fix != nil ? Self.positionWords(answer?.fields.first) : nil,
            headingMagDeg: Self.magnetic(fix?.trackDeg, variationDeg: variation),
            altitudeFt: fix?.altitudeFt.map { ($0 / 100).rounded() * 100 },
            fuelMin: Double(fuelMin.trimmingCharacters(in: .whitespaces)),
            souls: Double(souls.trimmingCharacters(in: .whitespaces)),
            frequencies: frequencies)
    }

    /// The line from the airplane to the field picked, and the glide's
    /// reach, for the map while the assistant is open.
    func line(from fix: OwnShip.Fix?) -> [CLLocationCoordinate2D] {
        guard open != nil, let fix, let picked else { return [] }
        return [fix.coordinate, CLLocationCoordinate2D(latitude: picked.lat, longitude: picked.lon)]
    }
}
