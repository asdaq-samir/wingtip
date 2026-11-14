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

    /// Returns once every write and erase asked so far is done, so a test
    /// waits on the work itself rather than on a clock.
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
