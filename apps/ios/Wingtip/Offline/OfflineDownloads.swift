import Foundation
import Observation
import Synchronization
import UIKit

/// How far each file of a download has come, for the Downloads list:
/// bytes written and expected by "cycle/region/archive".
@MainActor
@Observable
final class OfflineProgress {
    static let shared = OfflineProgress()
    private(set) var files: [String: (written: Int64, expected: Int64)] = [:]
    /// Bumped as a file lands, so the list reads the store again.
    private(set) var landed = 0
    /// The session's tasks that have ended: a progress update of one that
    /// arrives after its end (unstructured tasks keep no order) is dropped,
    /// so no stale row is left behind.
    @ObservationIgnored private var ended: Set<Int> = []

    func set(_ key: String, task: Int, written: Int64, expected: Int64) {
        guard !ended.contains(task) else { return }
        files[key] = (written, expected)
    }

    func done(_ key: String, task: Int) {
        ended.insert(task)
        files[key] = nil
        landed += 1
    }

    /// Bytes written of a region's files under way.
    func written(_ kept: OfflineKept) -> Int64 {
        files.filter { $0.key.hasPrefix(kept.id + "/") }.values.reduce(0) { $0 + $1.written }
    }
}

/// The regions' archives fetched by a background URLSession, so a
/// download of hundreds of megabytes goes on with the app in the
/// background or closed, as iOS schedules it (Apple's "Downloading files
/// in the background"), and resumes when the app is opened again. Each
/// task carries "cycle/region/archive" as its description; a file that
/// lands is moved into the store (OfflineStore.finish) before the
/// delegate returns, as the system deletes it after.
///
/// The session is made once, here in `init`: two sessions with the same
/// background identifier are undefined (Apple's URLSessionConfiguration
/// .background), events going to one and the other's tasks lost.
final class OfflineDownloads: Sendable {
    static let shared = OfflineDownloads()
    static let identifier = "app.wingtipmaps.ios.offline-charts"

    private let store: OfflineStore
    let session: URLSession
    /// The system's handler, held from the app delegate until the events
    /// of a session woken in the background are all delivered.
    @MainActor static var backgroundCompletion: (() -> Void)?

    init(store: OfflineStore = .shared) {
        self.store = store
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        config.sessionSendsLaunchEvents = true
        // Started by the pilot, so not left for the system to pick a time.
        config.isDiscretionary = false
        config.allowsExpensiveNetworkAccess = true
        session = URLSession(configuration: config, delegate: Delegate(store: store), delegateQueue: nil)
    }

    /// Called at launch, so the files finished while the app was closed
    /// are delivered (the session, made at `shared`'s first use, is what
    /// they are delivered to); and the cycles gone by swept.
    func start() {
        store.sweep()
    }

    /// Each archive of a region not yet on disk, fetched.
    func fetch(_ kept: OfflineKept, urls: [String: URL]) {
        session.getAllTasks { [session] tasks in
            let running = Set(tasks.compactMap(\.taskDescription))
            for (archive, url) in urls where !kept.done.contains(archive) {
                let key = "\(kept.id)/\(archive)"
                guard !running.contains(key) else { continue }
                let task = session.downloadTask(with: url)
                task.taskDescription = key
                task.countOfBytesClientExpectsToReceive = Int64(kept.wanted[archive] ?? 0)
                task.resume()
            }
        }
    }

    /// The tasks of a region stopped (before it is deleted).
    func cancel(_ kept: OfflineKept) {
        session.getAllTasks { tasks in
            for task in tasks where task.taskDescription?.hasPrefix(kept.id + "/") == true { task.cancel() }
        }
    }

    static func parts(_ key: String?) -> (cycle: String, region: String, archive: String)? {
        guard let parts = key?.split(separator: "/").map(String.init), parts.count == 3 else { return nil }
        return (parts[0], parts[1], parts[2])
    }

    /// The session's delegate: lands each file in the store and passes
    /// progress to the list, at most every `every` per task (a fast link
    /// calls back hundreds of times a second).
    private final class Delegate: NSObject, URLSessionDownloadDelegate, Sendable {
        private let store: OfflineStore
        private let told = Mutex<[Int: ContinuousClock.Instant]>([:])
        static let every: Duration = .milliseconds(250)

        init(store: OfflineStore) { self.store = store }

        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64,
                        totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
            guard let key = downloadTask.taskDescription else { return }
            let id = downloadTask.taskIdentifier
            let now = ContinuousClock.now
            let due = told.withLock { told in
                if let last = told[id], now - last < Self.every { return false }
                told[id] = now
                return true
            }
            guard due else { return }
            let expected = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : downloadTask.countOfBytesClientExpectsToReceive
            Task { @MainActor in OfflineProgress.shared.set(key, task: id, written: totalBytesWritten, expected: expected) }
        }

        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
            guard let key = downloadTask.taskDescription, let (cycle, region, archive) = OfflineDownloads.parts(key) else { return }
            let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
            do {
                guard status == 200 else { throw Planner.Failure(status: status, detail: nil) }
                try store.finish(cycle: cycle, region: region, archive: archive, file: location)
                Log.map.info("offline \(key, privacy: .public) kept")
            } catch {
                store.update("\(cycle)/\(region)") { $0?.failed = Problems.say("The region could not be kept", error) }
            }
            ended(downloadTask, key)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            guard let error, let key = task.taskDescription, let (cycle, region, _) = OfflineDownloads.parts(key) else { return }
            if (error as? URLError)?.code != .cancelled {
                store.update("\(cycle)/\(region)") { $0?.failed = Problems.say("The region could not be fetched", error) }
            }
            ended(task, key)
        }

        private func ended(_ task: URLSessionTask, _ key: String) {
            let id = task.taskIdentifier
            _ = told.withLock { $0.removeValue(forKey: id) }
            Task { @MainActor in OfflineProgress.shared.done(key, task: id) }
        }

        func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
            Task { @MainActor in
                let completion = OfflineDownloads.backgroundCompletion
                OfflineDownloads.backgroundCompletion = nil
                completion?()
            }
        }
    }
}

/// The app's delegate for what SwiftUI's App has no hook for: iOS waking
/// the app to hand over the downloads that finished while it was in the
/// background, and, as the responder chain's last link, the menu bar's
/// Find (WingtipCommands).
@MainActor
final class OfflineAppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        guard identifier == OfflineDownloads.identifier else { return completionHandler() }
        OfflineDownloads.backgroundCompletion = completionHandler
        OfflineDownloads.shared.start()
    }
}
