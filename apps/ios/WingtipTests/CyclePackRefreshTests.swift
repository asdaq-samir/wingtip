import Foundation
import Testing
@testable import Wingtip

/// A pack on the phone is fetched again when the planner lists another
/// crc32 for it (CyclePacks.keep): the crc32 it was written with is read
/// from its header, at byte 36, little-endian, as wingtip.cycle_pack's
/// write_phone lists it in /api/cycle-packs.
struct CyclePackRefreshTests {
    @Test func theCrc32IsReadFromThePacksHeader() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "pack-\(UUID().uuidString).pack")
        defer { try? FileManager.default.removeItem(at: file) }
        var bytes = Data(count: 36)
        bytes.append(contentsOf: [0x78, 0x56, 0x34, 0x12])
        bytes.append(Data(count: 24))
        try bytes.write(to: file)
        #expect(CyclePacks.crc32(of: file) == 0x1234_5678)
    }

    @Test func aPackNotOnThePhoneHasNone() {
        let file = FileManager.default.temporaryDirectory.appending(path: "none-\(UUID().uuidString).pack")
        #expect(CyclePacks.crc32(of: file) == nil)
    }

    @Test func aPackCutShortHasNone() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "short-\(UUID().uuidString).pack")
        defer { try? FileManager.default.removeItem(at: file) }
        try Data(count: 38).write(to: file)
        #expect(CyclePacks.crc32(of: file) == nil)
    }
}
