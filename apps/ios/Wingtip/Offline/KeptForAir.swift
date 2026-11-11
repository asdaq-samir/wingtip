import CryptoKit
import Foundation

/// The last good answer of each kind the route needs in the air, kept on
/// this device in Application Support: the ranked NOTAMs, the airport
/// cards, the plates' pages and their pictures, the Go / No-Go and the
/// weather loop's frame list, each with when the planner gave it. The
/// plan, its nav log and the briefing are Kept's (Kept.swift), not kept
/// twice. Each screen's model asks through `answer`: the planner's answer
/// is kept as it comes, and the kept one is given back, with its time,
/// when the planner cannot be reached, for the screen to say how old it
/// is (KeptAgeLine). Nothing here leaves the phone.
///
/// The public FAA and weather data stay at sign-out; the Go / No-Go, made
/// with the pilot's minimums, loading and currency, and the routes kept
/// are the pilot's own and go with them (`forgetPilotOwn`).
enum KeptForAir {
    /// The kinds, as the engine's `kept_age` and `ready_to_fly` name them.
    enum Kind: String, CaseIterable, Sendable {
        case briefing, weather, notams, airports, plates, plan
        case goNoGo = "go_no_go"
        case weatherLoop = "weather_loop"
    }

    struct Entry<T: Codable>: Codable {
        var value: T
        var fetchedAt: Date
    }

    /// What Keep for the Air holds for a route: the kinds it kept and the
    /// bytes they come to, the chart's tiles included.
    struct Manifest: Codable, Equatable, Sendable {
        var kinds: [String]
        var bytes: Int
        var at: Date
    }

    static let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "kept-for-air", directoryHint: .isDirectory)

    /// A key's file: its SHA-256 as the name, as a chart's address is far
    /// longer than a file's name may be.
    static func file(_ group: String, _ key: String, ext: String = "json", in folder: URL = folder) -> URL {
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appending(path: group, directoryHint: .isDirectory).appending(path: "\(name).\(ext)")
    }

    private static func put(_ data: Data, at url: URL) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    static func write<T: Codable>(_ value: T, _ kind: Kind, key: String, at: Date = Date(), in folder: URL = folder) {
        guard let data = try? encoder.encode(Entry(value: value, fetchedAt: at)) else { return }
        put(data, at: file(kind.rawValue, key, in: folder))
    }

    static func read<T: Codable>(_ type: T.Type, _ kind: Kind, key: String, in folder: URL = folder) -> Entry<T>? {
        guard let data = try? Data(contentsOf: file(kind.rawValue, key, in: folder)) else { return nil }
        return try? decoder.decode(Entry<T>.self, from: data)
    }

    static func has(_ kind: Kind, key: String, in folder: URL = folder) -> Bool {
        FileManager.default.fileExists(atPath: file(kind.rawValue, key, in: folder).path)
    }

    /// A planner's picture (a plate's page, a diagram) kept by its path.
    static func writePicture(_ data: Data, path: String, in folder: URL = folder) {
        put(data, at: file("pictures", path, ext: "img", in: folder))
    }

    static func picture(_ path: String, in folder: URL = folder) -> Data? {
        try? Data(contentsOf: file("pictures", path, ext: "img", in: folder))
    }

    /// The key a field's own NOTAMs are kept under: the one the airport
    /// card reads (AirportCard), so Keep for the Air's are the card's.
    static func fieldNotamsKey(_ ident: String) -> String { "field:\(ident.uppercased())" }

    /// The key an FAA airport diagram's PDF is kept under, by its address
    /// (the own-ship diagram, DiagramOwnShipView).
    static func pdfKey(_ url: String) -> String { "pdf:\(url)" }

    static func writeManifest(_ manifest: Manifest, route: String, in folder: URL = folder) {
        guard let data = try? encoder.encode(manifest) else { return }
        put(data, at: file("routes", route, in: folder))
    }

    static func manifest(route: String, in folder: URL = folder) -> Manifest? {
        guard let data = try? Data(contentsOf: file("routes", route, in: folder)) else { return nil }
        return try? decoder.decode(Manifest.self, from: data)
    }

    /// A file's bytes on disk; 0 where there is none.
    static func size(of url: URL) -> Int {
        (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    }

    /// Whether a failed ask should fall back on the kept answer: no signal,
    /// a timeout, the planner down; not the planner refusing the question
    /// (a 4xx), nor a task given up.
    static func fallsBack(_ error: any Error) -> Bool {
        if error is CancellationError { return false }
        if let failure = error as? Planner.Failure, (400..<500).contains(failure.status) { return false }
        return true
    }

    /// The planner asked, its answer kept as it comes; with no answer, the
    /// kept one, and when it was fetched, which KeptShown notes for the
    /// screen's age line. With nothing kept, the failure as it was.
    @MainActor
    static func answer<T: Codable>(_ kind: Kind, key: String, fetch: () async throws -> T) async throws -> (value: T, keptAt: Date?) {
        do {
            let value = try await fetch()
            write(value, kind, key: key)
            KeptShown.shared.note(kind, key: key, at: nil)
            return (value, nil)
        } catch {
            guard fallsBack(error), let kept = read(T.self, kind, key: key) else { throw error }
            KeptShown.shared.note(kind, key: key, at: kept.fetchedAt)
            return (kept.value, kept.fetchedAt)
        }
    }

    /// Signing out: the pilot's own -- the Go / No-Go made with their
    /// minimums, loading and currency, and which routes they kept -- gone;
    /// the FAA's and the weather's stay, as the charts do.
    static func forgetPilotOwn(in folder: URL = folder) {
        for group in [Kind.goNoGo.rawValue, "routes"] {
            try? FileManager.default.removeItem(at: folder.appending(path: group, directoryHint: .isDirectory))
        }
    }
}
