import Foundation
import Testing
@testable import Wingtip

/// The alerts ahead from packs on the phone (CyclePacks.ahead, the engine's
/// ahead), on the Chicago cut's phone packs (services/planner/tests_wingtip/fixtures/native/phone):
/// eastbound at 3,000 ft west of O'Hare, its Class B ahead, as the
/// planner's /api/airspace/ahead answers it there.
private final class AheadBundle {}

struct AheadTests {
    @Test func oHaresClassBAheadWithNoNetwork() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "ahead-\(UUID().uuidString)", directoryHint: .isDirectory)
        let cycle = "2026-10-29"
        try FileManager.default.createDirectory(at: root.appending(path: cycle), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let bundle = Bundle(for: AheadBundle.self)
        for region in ["n40w088", "n40w092"] {
            let from = try #require(bundle.url(forResource: region, withExtension: "pack"))
            try FileManager.default.copyItem(at: from, to: root.appending(path: "\(cycle)/\(region).pack"))
        }
        let index = """
        {"cycle":"\(cycle)","built_at":0,"tolerance_deg":0.0001,"worst_nm":0.006,"region_deg":4,"regions":[]}
        """
        try Data(index.utf8).write(to: root.appending(path: "index.json"))
        let packs = CyclePacks(root: root)
        let found = try #require(packs.ahead(lat: 41.98, lon: -88.35, trackDeg: 90, groundspeedKt: 120, altitudeFt: 3000))
        #expect(found.alerts.contains { $0.kind == "airspace" && $0.airspaceClass == "B" && $0.level == "warning" })
        // What the phone cannot know offline is said, not read as clear.
        #expect(found.unavailable.contains("obstacles") && found.unavailable.contains("TFRs"))
    }

    /// The regions read ahead are the engine's (regions_ahead, IOS-20): just
    /// west of a region's edge, eastbound at 200 kt, five minutes reach over
    /// it, so the region beyond is read too, its own first.
    @Test func theRegionAheadAcrossAnEdgeIsRead() throws {
        let (lat, lon) = (41.98, -88.01)
        let names = try Engine.regionsAhead(lat: lat, lon: lon, trackDeg: 90, lookAheadNm: 200 * CyclePacks.lookAheadS / 3600)
        #expect(names.first == Engine.region(lat: lat, lon: lon))
        #expect(names.contains(Engine.region(lat: lat, lon: lon + 0.3)))
    }
}
