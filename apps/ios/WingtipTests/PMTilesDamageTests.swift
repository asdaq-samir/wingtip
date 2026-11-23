import Foundation
import Testing
@testable import Wingtip

/// A damaged offline region (a download cut short, a flipped bit) read by
/// the PMTiles reader on the map's tile-load path: every case throws or
/// finds no tile, and none traps.
struct PMTilesDamageTests {
    /// A PMTiles varint (little-endian base 128).
    static func varint(_ value: UInt64) -> [UInt8] {
        var v = value, out: [UInt8] = []
        repeat {
            let low = UInt8(v & 0x7F)
            v >>= 7
            out.append(v == 0 ? low : low | 0x80)
        } while v != 0
        return out
    }

    /// A directory of `count` entries from its four columns.
    static func directory(ids: [UInt64], runs: [UInt64], lengths: [UInt64], offsets: [UInt64]) -> Data {
        Data(([UInt64(ids.count)] + ids + runs + lengths + offsets).flatMap(varint))
    }

    @Test func aGoodDirectoryReads() throws {
        let entries = try PMTilesReader.directory(Self.directory(ids: [5, 1], runs: [1, 1], lengths: [10, 20], offsets: [1, 0]), compression: 1)
        #expect(entries.map(\.tileID) == [5, 6])
        #expect(entries.map(\.offset) == [0, 10])
    }

    @Test(arguments: [
        // The first entry's offset 0: "after the one before", of which there is none.
        PMTilesDamageTests.directory(ids: [5], runs: [1], lengths: [10], offsets: [0]),
        // Tile ids whose deltas overflow 64 bits.
        PMTilesDamageTests.directory(ids: [.max, .max], runs: [1, 1], lengths: [1, 1], offsets: [1, 2]),
        // An offset after the entry before that overflows.
        PMTilesDamageTests.directory(ids: [1, 1], runs: [1, 1], lengths: [.max, 1], offsets: [2, 0]),
        // A count far past what the bytes hold.
        Data(PMTilesDamageTests.varint(1 << 40) + [0, 0, 0, 0]),
        // Cut off in the middle.
        Data(PMTilesDamageTests.varint(3) + [1, 1]),
        Data(),
    ])
    func aDamagedDirectoryThrows(_ packed: Data) {
        #expect(throws: PMTilesReader.Failure.self) { try PMTilesReader.directory(packed, compression: 1) }
    }

    /// The sample archive cut short at several points: either refused as
    /// it is opened or read with the tiles past the cut missing.
    @Test(arguments: [40, 127, 200, 400, 800])
    func aTruncatedArchiveNeverTraps(_ kept: Int) throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "offline-\(UUID().uuidString).pmtiles")
        try OfflineChartsTests.sample.prefix(kept).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        guard let reader = try? PMTilesReader(url: url) else { return }
        for (z, x, y) in [(12, 7, 25), (10, 14, 36), (3, 7, 0), (12, 833, 1559)] {
            _ = reader.tile(z: z, x: x, y: y)
        }
        #expect(reader.tile(z: 12, x: 833, y: 1559) == nil)
    }

    /// A header whose root directory runs past the end of the file.
    @Test func aRootPastTheFileIsRefused() throws {
        var head = OfflineChartsTests.sample.prefix(127)
        let huge = UInt64.max.littleEndian
        withUnsafeBytes(of: huge) { head.replaceSubrange(head.startIndex + 16..<head.startIndex + 24, with: $0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "offline-\(UUID().uuidString).pmtiles")
        try head.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(throws: PMTilesReader.Failure.truncated) { try PMTilesReader(url: url) }
    }
}
