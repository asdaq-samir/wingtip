import CoreLocation
import Foundation
import UIKit

/// The facts Ready to fly is asked with, gathered from what the phone
/// holds: the plan, the chart kept along the route, the cycle packs, the
/// briefing, the NOTAMs, the battery, location and the receiver. Only
/// facts: what counts as missing or too old, the words and the order are
/// the engine's (`ready_to_fly`, engine/crates/weather/src/ready.rs), so
/// no limit is written here.
enum ReadyFacts {
    typealias Input = EngineContract.ReadyToFlyInput

    /// The plan as it stands: the airplane's name only where the pilot
    /// picked one, never a type assumed for them (docs/decisions/0011),
    /// and the altitude flown, the pilot's or the planner's pick.
    @MainActor
    static func plan(_ plan: Plan) -> EngineContract.ReadyToFlyInputPlan {
        EngineContract.ReadyToFlyInputPlan(route: plan.routed, airplane: plan.airplaneName, altitudeFt: plan.altitudeFt ?? plan.ownAltitudeFt)
    }

    /// The departure's and the destination's reports in the briefing: when
    /// each METAR was observed and whether a TAF is among the forecast's
    /// stations. None before a briefing has come, where the briefing's own
    /// item already asks for one.
    static func fields(dep: String, dest: String, briefing: Briefing?) -> [EngineContract.ReadyToFlyInputFieldsItem]? {
        guard let briefing, !dep.isEmpty, !dest.isEmpty else { return nil }
        let tafs = Set(briefing.forecast.stations.filter { $0.raw != nil }.map { $0.icaoId.uppercased() })
        return [(dep, "departure"), (dest, "destination")].map { ident, role in
            let station = station(ident, in: briefing)
            let observed = station.flatMap { briefing.metars.additionalProperties[$0] ?? nil }?.observedAt.flatMap { AirportWords.date($0) }
            return EngineContract.ReadyToFlyInputFieldsItem(ident: ident, role: role, metarObserved: observed?.timeIntervalSince1970,
                                                            taf: candidates(ident).contains { tafs.contains($0) })
        }
    }

    /// The briefing's key for a field: as typed, else with the K a
    /// three-letter US identifier takes in ICAO form ("OSH" is "KOSH").
    static func station(_ ident: String, in briefing: Briefing) -> String? {
        candidates(ident).first { briefing.metars.additionalProperties.keys.contains($0) }
    }

    private static func candidates(_ ident: String) -> [String] {
        let up = ident.uppercased()
        return up.count == 3 && up.allSatisfy(\.isLetter) ? [up, "K" + up] : [up]
    }

    /// A chart cycle as the engine takes it, YYYY-MM-DD: the planner names
    /// the chart's edition as the FAA's page does, MM-DD-YYYY
    /// (wingtip.charts current_cycle). Nil where it is neither.
    static func isoDay(_ cycle: String?) -> String? {
        guard let cycle else { return nil }
        let parts = cycle.split(separator: "-").map(String.init)
        guard parts.count == 3, parts.allSatisfy({ Int($0) != nil }) else { return nil }
        if parts[0].count == 4 { return cycle }
        if parts[2].count == 4 { return "\(parts[2])-\(parts[0])-\(parts[1])" }
        return nil
    }

    /// Location as the engine names it: allowed, refused (or barred by
    /// the phone's restrictions), or not yet asked.
    static func location(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse: "granted"
        case .denied, .restricted: "denied"
        default: "prompt"
        }
    }

    /// The battery as iOS reports it, a percentage; nil where it cannot
    /// tell (the simulator, monitoring off), which leaves the item out.
    static func battery(level: Float, state: UIDevice.BatteryState) -> (pct: Double?, charging: Bool?) {
        let pct = level < 0 ? nil : (Double(level) * 100).rounded()
        let charging: Bool? = switch state {
        case .charging, .full: true
        case .unplugged: false
        default: nil
        }
        return (pct, charging)
    }

    /// Whether the plan on the page is the one kept on the phone for no
    /// signal (Kept): the same route, its nav log whole.
    static func saved(dep: String, dest: String, stops: [String], kept: Kept?) -> Bool {
        guard let kept else { return false }
        return kept.dep == dep && kept.dest == dest && kept.stops == stops && kept.totals != nil
    }

    /// What Keep for the Air holds for the route (KeptForAir, Kept): each
    /// kind on the phone or not, and the size its last keep came to. The
    /// briefing's and the NOTAMs' ages are their own items; this is only
    /// whether they are on board.
    static func kept(manifest: KeptForAir.Manifest?, saved: Bool, briefed: Bool, notams: Bool, goNoGo: Bool) -> EngineContract.ReadyToFlyInputKept {
        var on = Set(manifest?.kinds ?? [])
        if saved { on.insert(KeptForAir.Kind.plan.rawValue) }
        if saved, briefed { on.formUnion([KeptForAir.Kind.briefing.rawValue, KeptForAir.Kind.weather.rawValue]) }
        if notams { on.insert(KeptForAir.Kind.notams.rawValue) }
        if goNoGo { on.insert(KeptForAir.Kind.goNoGo.rawValue) }
        let all = KeptForAir.Kind.allCases.map(\.rawValue)
        return EngineContract.ReadyToFlyInputKept(onBoard: all.filter(on.contains), missing: all.filter { !on.contains($0) },
                                                  sizeMb: manifest.map { Double($0.bytes) / 1_000_000 })
    }

    /// The receiver, only for a pilot who flies with one (one has been
    /// heard on this phone and listening is on); nil leaves it out.
    static func receiver(used: Bool, listening: Bool, live: Bool) -> EngineContract.ReadyToFlyInputReceiver? {
        guard used, listening else { return nil }
        return EngineContract.ReadyToFlyInputReceiver(used: true, connected: live)
    }

    /// The engine's next AIRAC day, "2026-11-26", as the pilot reads it:
    /// "26 Nov". How a date is written is the app's.
    static func dayWords(_ iso: String) -> String {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return iso }
        // The FAA's own English month, whatever the phone's language: a
        // cycle date reads as the chart's edition does.
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        return "\(parts[2]) \(calendar.shortMonthSymbols[parts[1] - 1])"
    }
}

/// Where the chart and the packs for a route stand on the phone: worked
/// out off the main thread, as it reads a few hundred files.
struct ReadyStore: Equatable, Sendable {
    var chartsKept: Bool
    var chartEdition: String?
    var packEdition: String?

    /// The tiles KeepForAir keeps for the route, and the packs of
    /// the regions it crosses, looked for on disk.
    static func look(tiles: Set<KeepRoute.Tile>, template: TileTemplate?, regions: Set<String>) async -> ReadyStore {
        await Task.detached(priority: .utility) {
            var kept = false
            if let template, !tiles.isEmpty {
                let store = TileStore.shared
                kept = tiles.allSatisfy { tile in
                    FileManager.default.fileExists(atPath: store.path(cycle: template.cycle, kind: template.kind, z: tile.z, x: tile.x, y: tile.y, scale: template.scale).path)
                        || store.read(cycle: template.cycle, kind: template.kind, z: tile.z, x: tile.x, y: tile.y, scale: template.scale) != nil
                }
            }
            let packs = CyclePacks.shared
            var edition: String?
            if let index = packs.index {
                // The cycle's packs held where every region of the route
                // the planner has a pack of is on disk; with no route, the
                // cycle the phone holds at all.
                let listed = Set(index.regions.map(\.name))
                let whole = regions.intersection(listed).allSatisfy { FileManager.default.fileExists(atPath: packs.path(cycle: index.cycle, region: $0).path) }
                edition = whole ? index.cycle : nil
            }
            return ReadyStore(chartsKept: kept, chartEdition: kept ? ReadyFacts.isoDay(template?.cycle) : nil, packEdition: edition)
        }.value
    }
}
