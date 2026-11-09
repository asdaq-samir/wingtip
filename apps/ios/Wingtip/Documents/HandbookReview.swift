import Foundation

/// A handbook page's read as the pilot confirms it, item by item: a figure
/// edited, the read cut to the confirmed items, and the engine's own
/// `handbook_read_check` asked again on the phone. No figure is worked out
/// here: the units, the flags and the airplane form's profile are the
/// engine's (engine/crates/pilot/src/documents).
enum HandbookReview {
    /// The engine's check of a read (the rule's input is the read itself,
    /// its keys as the reader wrote them), its answer as the reader sent it.
    static func check(_ read: JSONValue) throws -> ASHandbookCheck {
        try Engine.call("handbook_read_check", read, decoder: Planner.snakeCase)
    }

    /// The read with only the confirmed items: a cruise, takeoff or landing
    /// row kept where its item ("cruise.2") is confirmed, the climb, glide,
    /// empty weight and fuel left out, the maximum takeoff weight null and
    /// the envelope empty where theirs is not.
    static func confirmedOnly(_ read: JSONValue, keys: Set<String>) -> JSONValue {
        guard case .object(var top) = read else { return read }
        for table in ["cruise", "takeoff", "landing"] {
            guard case .array(let rows)? = top[table] else { continue }
            top[table] = .array(rows.enumerated().filter { keys.contains("\(table).\($0.offset)") }.map(\.element))
        }
        for group in ["climb", "glide", "empty", "fuel"] where !keys.contains(group) {
            top[group] = .null
        }
        if !keys.contains("weight") { top["max_takeoff_weight"] = .null }
        if !keys.contains("envelope") { top["envelope"] = .array([]) }
        return .object(top)
    }

    /// The read with one figure written at its path ("cruise.2.tas",
    /// "max_takeoff_weight"), in the page's own unit as the pilot reads it
    /// off the page. A path the read does not have leaves it as it was.
    static func setting(_ read: JSONValue, path: String, to value: Double) -> JSONValue {
        set(read, path.split(separator: ".").map(String.init)[...], value) ?? read
    }

    private static func set(_ node: JSONValue, _ parts: ArraySlice<String>, _ value: Double) -> JSONValue? {
        guard let first = parts.first else { return .number(value) }
        let rest = parts.dropFirst()
        switch node {
        case .object(var object):
            // A figure's own member may be null or missing in the read; its
            // parent must be there.
            if rest.isEmpty {
                object[first] = .number(value)
            } else {
                guard let child = object[first], let next = set(child, rest, value) else { return nil }
                object[first] = next
            }
            return .object(object)
        case .array(var list):
            guard let i = Int(first), list.indices.contains(i) else { return nil }
            guard let next = rest.isEmpty ? .number(value) : set(list[i], rest, value) else { return nil }
            list[i] = next
            return .array(list)
        default:
            return nil
        }
    }

    /// The figures to save with the airplane (the gateway's HandbookFigures,
    /// the same shape in the same app units).
    static func gateway(_ h: ASHandbookFigures) -> GWHandbookFigures {
        GWHandbookFigures(
            climbBurnGph: h.climbBurnGph, climbRateFpm: h.climbRateFpm, climbSpeedKias: h.climbSpeedKias,
            cruise: (h.cruise ?? []).map { GWCruise(altitudeFt: $0.altitudeFt, burnGph: $0.burnGph, powerPct: $0.powerPct, rpm: $0.rpm, tasKt: $0.tasKt) },
            emptyArmIn: h.emptyArmIn, emptyWeightLb: h.emptyWeightLb,
            envelope: (h.envelope ?? []).map { GWCorner(armIn: $0.armIn, weightLb: $0.weightLb) },
            fuelTotalGal: h.fuelTotalGal, glideRatio: h.glideRatio, glideSpeedKias: h.glideSpeedKias,
            landing: (h.landing ?? []).map { GWDistance(groundRollFt: $0.groundRollFt, overObstacleFt: $0.overObstacleFt, pressureAltitudeFt: $0.pressureAltitudeFt, tempC: $0.tempC) },
            maxTakeoffWeightLb: h.maxTakeoffWeightLb,
            takeoff: (h.takeoff ?? []).map { GWDistance(groundRollFt: $0.groundRollFt, overObstacleFt: $0.overObstacleFt, pressureAltitudeFt: $0.pressureAltitudeFt, tempC: $0.tempC) },
            usableFuelGal: h.usableFuelGal)
    }

    /// A page's figures over those kept before: a performance page then a
    /// weight and balance page fill one record, each figure or table the
    /// newer page has taking the place of the older's.
    static func merged(_ kept: GWHandbookFigures?, _ new: GWHandbookFigures) -> GWHandbookFigures {
        guard let kept else { return new }
        func list<T>(_ a: [T], _ b: [T]) -> [T] { b.isEmpty ? a : b }
        return GWHandbookFigures(
            climbBurnGph: new.climbBurnGph ?? kept.climbBurnGph, climbRateFpm: new.climbRateFpm ?? kept.climbRateFpm,
            climbSpeedKias: new.climbSpeedKias ?? kept.climbSpeedKias, cruise: list(kept.cruise, new.cruise),
            emptyArmIn: new.emptyArmIn ?? kept.emptyArmIn, emptyWeightLb: new.emptyWeightLb ?? kept.emptyWeightLb,
            envelope: list(kept.envelope, new.envelope), fuelTotalGal: new.fuelTotalGal ?? kept.fuelTotalGal,
            glideRatio: new.glideRatio ?? kept.glideRatio, glideSpeedKias: new.glideSpeedKias ?? kept.glideSpeedKias,
            landing: list(kept.landing, new.landing), maxTakeoffWeightLb: new.maxTakeoffWeightLb ?? kept.maxTakeoffWeightLb,
            takeoff: list(kept.takeoff, new.takeoff), usableFuelGal: new.usableFuelGal ?? kept.usableFuelGal)
    }

    /// The airplane form's figures from the engine's profile, only those it
    /// gives, each to a tenth as the form shows them.
    static func fill(_ form: inout AircraftForm, from profile: ASHandbookProfile) {
        if let v = profile.cruiseTasKt { form.cruiseTasKt = Format.tenths(v) }
        if let v = profile.fuelBurnGph { form.fuelBurnGph = Format.tenths(v) }
        if let v = profile.cruisePowerPct { form.cruisePowerPct = Format.tenths(v) }
        if let v = profile.climbFuelBurnGph { form.climbFuelBurnGph = Format.tenths(v) }
        if let v = profile.usableFuelGal { form.usableFuelGal = Format.tenths(v) }
    }
}

extension Gateway {
    /// The airplane's handbook figures as the pilot confirmed them (PUT
    /// /api/aircraft/{id}/handbook); nil takes them away.
    static func saveHandbook(_ id: Int, _ figures: GWHandbookFigures?) async throws -> OwnAircraftRecord {
        try await send(OwnAircraftRecord.self, "PUT", "/api/aircraft/\(id)/handbook", json: GWHandbookRequest(figures: figures))
    }
}
