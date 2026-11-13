import Foundation
import OpenAPIRuntime

/// A handbook page's read as the pilot confirms it, item by item: a figure
/// edited, the read cut to the confirmed items, and the engine's own
/// `handbook_read_check` asked again on the phone. No figure is worked out
/// here: the units, the flags and the airplane form's profile are the
/// engine's (engine/crates/pilot/src/documents).
enum HandbookReview {
    /// The engine's check of a read (the rule's input is the read itself,
    /// its keys as the reader wrote them).
    static func check(_ read: OpenAPIValueContainer) throws -> HandbookCheck {
        try Engine.call("handbook_read_check", read)
    }

    /// The read with only the confirmed items: a cruise, takeoff or landing
    /// row kept where its item ("cruise.2") is confirmed, the climb, glide,
    /// empty weight and fuel left out, the maximum takeoff weight null and
    /// the envelope empty where theirs is not.
    static func confirmedOnly(_ read: OpenAPIValueContainer, keys: Set<String>) -> OpenAPIValueContainer {
        guard var top = read.value as? [String: (any Sendable)?] else { return read }
        for table in ["cruise", "takeoff", "landing"] {
            guard let rows = top[table] as? [(any Sendable)?] else { continue }
            top[table] = rows.enumerated().filter { keys.contains("\(table).\($0.offset)") }.map(\.element)
        }
        for group in ["climb", "glide", "empty", "fuel"] where !keys.contains(group) {
            top[group] = .some(nil)
        }
        if !keys.contains("weight") { top["max_takeoff_weight"] = .some(nil) }
        if !keys.contains("envelope") { top["envelope"] = [(any Sendable)?]() }
        return (try? OpenAPIValueContainer(unvalidatedValue: top)) ?? read
    }

    /// The read with one figure written at its path ("cruise.2.tas",
    /// "max_takeoff_weight"), in the page's own unit as the pilot reads it
    /// off the page. A path the read does not have leaves it as it was.
    static func setting(_ read: OpenAPIValueContainer, path: String, to value: Double) -> OpenAPIValueContainer {
        guard let set = set(read.value, path.split(separator: ".").map(String.init)[...], value) else { return read }
        return (try? OpenAPIValueContainer(unvalidatedValue: set)) ?? read
    }

    private static func set(_ node: (any Sendable)?, _ parts: ArraySlice<String>, _ value: Double) -> (any Sendable)? {
        guard let first = parts.first else { return value }
        let rest = parts.dropFirst()
        if var object = node as? [String: (any Sendable)?] {
            // A figure's own member may be null or missing in the read; its
            // parent must be there.
            if rest.isEmpty {
                object[first] = value
            } else {
                guard let child = object[first], let next = set(child, rest, value) else { return nil }
                object[first] = next
            }
            return object
        }
        if var list = node as? [(any Sendable)?] {
            guard let i = Int(first), list.indices.contains(i) else { return nil }
            guard let next = rest.isEmpty ? value : set(list[i], rest, value) else { return nil }
            list[i] = next
            return list
        }
        return nil
    }

    /// The figures to save with the airplane (the gateway's HandbookFigures,
    /// the same shape in the same app units).
    static func gateway(_ h: HandbookFigures) -> GWHandbookFigures {
        GWHandbookFigures(
            climbBurnGph: h.climbBurnGph, climbRateFpm: h.climbRateFpm, climbSpeedKias: h.climbSpeedKias,
            cruise: h.cruise.map { GWCruise(altitudeFt: $0.altitudeFt, burnGph: $0.burnGph, powerPct: $0.powerPct, rpm: $0.rpm, tasKt: $0.tasKt) },
            emptyArmIn: h.emptyArmIn, emptyWeightLb: h.emptyWeightLb,
            envelope: h.envelope.map { GWCorner(armIn: $0.armIn, weightLb: $0.weightLb) },
            fuelTotalGal: h.fuelTotalGal, glideRatio: h.glideRatio, glideSpeedKias: h.glideSpeedKias,
            landing: h.landing.map { GWDistance(groundRollFt: $0.groundRollFt, overObstacleFt: $0.overObstacleFt, pressureAltitudeFt: $0.pressureAltitudeFt, tempC: $0.tempC) },
            maxTakeoffWeightLb: h.maxTakeoffWeightLb,
            takeoff: h.takeoff.map { GWDistance(groundRollFt: $0.groundRollFt, overObstacleFt: $0.overObstacleFt, pressureAltitudeFt: $0.pressureAltitudeFt, tempC: $0.tempC) },
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
    static func fill(_ form: inout AircraftForm, from profile: HandbookProfile) {
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
        try await call { try await $0.handbook(path: .init(id: id), body: .json(GWHandbookRequest(figures: figures))).ok.body.json }
    }
}
