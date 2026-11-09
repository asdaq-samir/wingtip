import Foundation

/// A PMTiles archive (protomaps' format, spec v3) on the phone's disk,
/// read a tile at a time with ranged reads of the file: the 127-byte
/// header once, each directory once as it is first needed (kept, the
/// leaves in a small LRU), and then a tile's own bytes. What the planner
/// cuts a region's chart into (wingtip.offline_charts, its writer
/// wingtip.tile_archive), so the map draws a downloaded region's tiles
/// with no signal. Never mapped whole: Alaska's sectional at 2x is 7 GB,
/// more than a process's address space on some phones.
final class PMTilesReader: @unchecked Sendable {
    struct Header: Equatable, Sendable {
        let rootOffset: UInt64, rootLength: UInt64
        let leafOffset: UInt64
        let dataOffset: UInt64
        let minZoom: Int, maxZoom: Int
        /// 1 none, 2 gzip: how the directories are packed.
        let internalCompression: UInt8
    }

    struct Entry: Equatable, Sendable {
        let tileID: UInt64
        var offset: UInt64
        let length: UInt64
        let runLength: UInt64
    }

    let url: URL
    let header: Header
    private let handle: FileHandle
    private let lock = NSLock()
    private var root: [Entry]
    private var leaves: [UInt64: [Entry]] = [:]
    private var leafOrder: [UInt64] = []

    init(url: URL) throws {
        self.url = url
        handle = try FileHandle(forReadingFrom: url)
        let head = try Self.read(handle, offset: 0, length: 127)
        header = try Self.header(head)
        root = try Self.directory(Self.read(handle, offset: header.rootOffset, length: Int(header.rootLength)), compression: header.internalCompression)
    }

    deinit { try? handle.close() }

    /// The tile's bytes, or nil where the archive has none.
    func tile(z: Int, x: Int, y: Int) -> Data? {
        guard z >= header.minZoom, z <= header.maxZoom, let id = Self.tileID(z: z, x: x, y: y) else { return nil }
        return lock.withLock {
            var entries = root
            // PMTiles' deepest directory is four levels.
            for _ in 0..<4 {
                guard let entry = Self.find(entries, id) else { return nil }
                if entry.runLength > 0 {
                    return try? Self.read(handle, offset: header.dataOffset + entry.offset, length: Int(entry.length))
                }
                guard let leaf = leaf(at: header.leafOffset + entry.offset, length: entry.length) else { return nil }
                entries = leaf
            }
            return nil
        }
    }

    private func leaf(at offset: UInt64, length: UInt64) -> [Entry]? {
        if let kept = leaves[offset] { return kept }
        guard let bytes = try? Self.read(handle, offset: offset, length: Int(length)),
              let entries = try? Self.directory(bytes, compression: header.internalCompression) else { return nil }
        leaves[offset] = entries
        leafOrder.append(offset)
        if leafOrder.count > 64 { leaves[leafOrder.removeFirst()] = nil }
        return entries
    }

    // MARK: - The format

    enum Failure: Error { case notPMTiles, truncated, compression }

    static func read(_ handle: FileHandle, offset: UInt64, length: Int) throws -> Data {
        try handle.seek(toOffset: offset)
        guard let data = try handle.read(upToCount: length), data.count == length else { throw Failure.truncated }
        return data
    }

    static func header(_ d: Data) throws -> Header {
        guard d.count >= 127, d.prefix(7) == Data("PMTiles".utf8), d[d.startIndex + 7] == 3 else { throw Failure.notPMTiles }
        func u64(_ at: Int) -> UInt64 {
            d.subdata(in: d.startIndex + at..<d.startIndex + at + 8).withUnsafeBytes { $0.loadUnaligned(as: UInt64.self) }.littleEndian
        }
        return Header(rootOffset: u64(8), rootLength: u64(16), leafOffset: u64(40), dataOffset: u64(56),
                      minZoom: Int(d[d.startIndex + 100]), maxZoom: Int(d[d.startIndex + 101]),
                      internalCompression: d[d.startIndex + 97])
    }

    /// A directory's entries: a varint count, then the tile ids as
    /// deltas, the run lengths, the lengths and the offsets, each a run
    /// of varints (an offset of 0 after the first: straight after the
    /// entry before).
    static func directory(_ packed: Data, compression: UInt8) throws -> [Entry] {
        let bytes = compression == 2 ? try gunzip(packed) : packed
        var at = bytes.startIndex
        func varint() throws -> UInt64 {
            var value: UInt64 = 0, shift: UInt64 = 0
            while at < bytes.endIndex {
                let b = bytes[at]
                at += 1
                value |= UInt64(b & 0x7F) << shift
                if b & 0x80 == 0 { return value }
                shift += 7
                if shift > 63 { break }
            }
            throw Failure.truncated
        }
        let count = Int(try varint())
        var ids = [UInt64](), last: UInt64 = 0
        ids.reserveCapacity(count)
        for _ in 0..<count { last += try varint(); ids.append(last) }
        let runs = try (0..<count).map { _ in try varint() }
        let lengths = try (0..<count).map { _ in try varint() }
        var entries: [Entry] = []
        entries.reserveCapacity(count)
        for i in 0..<count {
            let raw = try varint()
            let offset = (i > 0 && raw == 0) ? entries[i - 1].offset + entries[i - 1].length : raw - 1
            entries.append(Entry(tileID: ids[i], offset: offset, length: lengths[i], runLength: runs[i]))
        }
        return entries
    }

    /// The entry holding `id`: an exact one, else the one before it where
    /// it is a leaf directory or a run that reaches it.
    static func find(_ entries: [Entry], _ id: UInt64) -> Entry? {
        var lo = 0, hi = entries.count - 1
        while lo <= hi {
            let mid = (lo + hi) >> 1
            if entries[mid].tileID < id { lo = mid + 1 } else if entries[mid].tileID > id { hi = mid - 1 } else { return entries[mid] }
        }
        guard hi >= 0 else { return nil }
        let before = entries[hi]
        if before.runLength == 0 || id - before.tileID < before.runLength { return before }
        return nil
    }

    /// A tile's id: the tiles of every level above, then its place on
    /// the level's Hilbert curve (the spec's zxy_to_tileid).
    static func tileID(z: Int, x: Int, y: Int) -> UInt64? {
        guard z >= 0, z < 32, x >= 0, y >= 0, x < 1 << z, y < 1 << z else { return nil }
        var acc = ((UInt64(1) << UInt64(z * 2)) - 1) / 3
        var x = UInt64(x), y = UInt64(y)
        var a = z - 1
        while a >= 0 {
            let s = UInt64(1) << UInt64(a)
            let rx = s & x, ry = s & y
            acc += ((3 * rx) ^ ry) << UInt64(a)
            if ry == 0 {
                // Wrapping, as the spec's arbitrary-precision integers go
                // negative here: only the low bits are read after (s & x).
                if rx != 0 { x = s &- 1 &- x; y = s &- 1 &- y }
                swap(&x, &y)
            }
            a -= 1
        }
        return acc
    }

    /// A gzip member's deflate stream inflated (RFC 1952): its header
    /// skipped, flags and all, and its eight-byte trailer left off.
    static func gunzip(_ data: Data) throws -> Data {
        let d = [UInt8](data)
        guard d.count > 18, d[0] == 0x1F, d[1] == 0x8B, d[2] == 8 else { throw Failure.compression }
        let flags = d[3]
        var at = 10
        if flags & 0x04 != 0 { at += 2 + Int(d[at]) + Int(d[at + 1]) << 8 }
        if flags & 0x08 != 0 { while at < d.count, d[at] != 0 { at += 1 }; at += 1 }
        if flags & 0x10 != 0 { while at < d.count, d[at] != 0 { at += 1 }; at += 1 }
        if flags & 0x02 != 0 { at += 2 }
        guard at < d.count - 8 else { throw Failure.compression }
        // NSData's zlib is raw DEFLATE (RFC 1951), what a gzip member holds.
        guard let out = try? (Data(d[at..<(d.count - 8)]) as NSData).decompressed(using: .zlib) else { throw Failure.compression }
        return out as Data
    }
}
