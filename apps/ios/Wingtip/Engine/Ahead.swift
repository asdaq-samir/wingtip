import Foundation
import WingtipEngine

/// The alerts ahead with no network, from the packs kept on the phone
/// (wingtip_engine::ahead, through WingtipEngine's ahead): what the planner's
/// /api/airspace/ahead answers -- the Class B, C and D and special-use
/// areas in the next five minutes, the ground within 500 ft in the next
/// minute -- worked out on the phone when the planner cannot be reached.
/// The obstacles are the planner's alone, and the TFRs are not kept on
/// the phone yet: both are said to be missing, never read as clear.
extension CyclePacks {
    struct Ahead: Decodable, Sendable {
        let alerts: [AheadAlert]
        let unavailable: [String]
        /// The packs' ground under the airplane (their terrain grid's
        /// highest in its cell, with its margin), the glide ring's ground.
        var groundFt: Double?

        /// The engine's keys: the alerts are the planner's generated type,
        /// which names its own, so no strategy reads the answer.
        enum CodingKeys: String, CodingKey {
            case alerts, unavailable
            case groundFt = "ground_ft"
        }
    }

    /// How far ahead the alerts look, seconds: the planner's and the
    /// engine's five minutes along the track (wingtip.alerts).
    static let lookAheadS: Double = 300

    /// Nil where no pack round the point was ever kept, or where the engine
    /// cannot say which regions are ahead (logged by Engine.rule): no
    /// answer, never "nothing ahead".
    func ahead(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?,
               route: [[Double]]? = nil, now: Date = Date()) -> Ahead? {
        guard let index else { return nil }
        // The regions the track and the route cross in the next five
        // minutes, the engine's regions_ahead (IOS-20): a fixed third of a
        // degree round the airplane fell short of 17 nm east at 48 N.
        guard let names = try? Engine.regionsAhead(lat: lat, lon: lon, trackDeg: trackDeg, route: route,
                                                   lookAheadNm: groundspeedKt * Self.lookAheadS / 3600) else { return nil }
        let packs = kept(Set(names), cycle: index.cycle)
        guard !packs.isEmpty else { return nil }
        // An engine that failed (its refusal, never a crash) has no
        // answer, as a region never kept has none: not "nothing ahead".
        guard let answer = try? WingtipEngine.ahead(packs: packs, lat: lat, lon: lon, trackDeg: trackDeg, gsKt: groundspeedKt,
                                                    altFt: altitudeFt, vsFpm: 0, now: Int64(now.timeIntervalSince1970), tfrs: nil,
                                                    tfrsAt: nil) else { return nil }
        return try? Planner.json.decode(Ahead.self, from: Data(answer.utf8))
    }

    /// The same off the main actor: OwnShip asks it every ten seconds in
    /// the air, and it reads the packs round the airplane.
    @concurrent func aheadOffMain(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?,
                                  route: [[Double]]?) async -> Ahead? {
        ahead(lat: lat, lon: lon, trackDeg: trackDeg, groundspeedKt: groundspeedKt, altitudeFt: altitudeFt, route: route)
    }

    // kept: InView.swift, shared with the in-view readers.
}
