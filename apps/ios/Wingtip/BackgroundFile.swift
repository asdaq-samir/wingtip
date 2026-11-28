import Foundation

/// A file kept by the app and written off the main actor: each write
/// encoded and put on disk by a task of its own, in the order asked (each
/// waits on the one before), so a long track's JSON (FlightRecorder,
/// OwnTrail) is no longer encoded and written on the main thread while
/// the map moves.
@MainActor
final class BackgroundFile {
    let url: URL
    private var last: Task<Void, Never>?

    init(_ url: URL) {
        self.url = url
    }

    /// The value written as JSON, after every write asked before it.
    func write(_ value: some Encodable & Sendable) {
        let url = url
        then {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if let data = try? JSONEncoder().encode(value) { try? data.write(to: url, options: .atomic) }
        }
    }

    /// The file gone at once, and again after any write still under way,
    /// so none of those puts it back (signing out, deleting the account).
    func remove() {
        try? FileManager.default.removeItem(at: url)
        let url = url
        then { try? FileManager.default.removeItem(at: url) }
    }

    /// The file's JSON read and decoded off the main actor, after every
    /// write asked before it; nil where there is none or it does not
    /// decode. What a model kept between launches reads after the first
    /// frame (ScreenModels.loadKept), not in its init before it.
    func read<T: Decodable & Sendable>(_: T.Type) async -> T? {
        await last?.value
        return await Self.decoded(T.self, url)
    }

    @concurrent
    private nonisolated static func decoded<T: Decodable & Sendable>(_: T.Type, _ url: URL) async -> T? {
        (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(T.self, from: $0) }
    }

    /// Returns once every write and erase asked so far has run.
    func settled() async {
        await last?.value
    }

    private func then(_ work: @escaping @Sendable () -> Void) {
        let before = last
        last = Task.detached(priority: .utility) {
            await before?.value
            work()
        }
    }
}
