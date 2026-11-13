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

    /// Nil where no pack round the point was ever kept.
    func ahead(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?,
               now: Date = Date()) -> Ahead? {
        guard let index else { return nil }
        // The regions within a third of a degree: five minutes' track at
        // 200 kt is 17 nm, a quarter of a degree.
        var names = Set<String>()
        for dlat in [-0.3, 0, 0.3] {
            for dlon in [-0.3, 0, 0.3] {
                names.insert(Engine.region(lat: lat + dlat, lon: lon + dlon))
            }
        }
        let packs = kept(names, cycle: index.cycle)
        guard !packs.isEmpty else { return nil }
        let answer = WingtipEngine.ahead(packs: packs, lat: lat, lon: lon, trackDeg: trackDeg, gsKt: groundspeedKt, altFt: altitudeFt,
                                         vsFpm: 0, now: Int64(now.timeIntervalSince1970), tfrs: nil, tfrsAt: nil)
        return try? Planner.json.decode(Ahead.self, from: Data(answer.utf8))
    }

    /// The same off the main actor: OwnShip asks it every ten seconds in
    /// the air, and it reads the packs round the airplane.
    @concurrent func aheadOffMain(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?) async -> Ahead? {
        ahead(lat: lat, lon: lon, trackDeg: trackDeg, groundspeedKt: groundspeedKt, altitudeFt: altitudeFt)
    }

    // kept: InView.swift, shared with the in-view readers.
}
