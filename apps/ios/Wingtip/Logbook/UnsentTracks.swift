import Foundation
import Network
import Observation

/// The flown tracks logged whose upload to their saved flight has not yet
/// gone through (no signal after landing is common), kept on the phone
/// until it has: the only copy of a flight's track once the recorder has
/// let it go (IOS-1). Sent again when the app is next in front with a
/// network (`sendWhenOnline`), and gone with the recorder's own track when
/// the pilot signs out (FlightRecorder.erase).
@MainActor
@Observable
final class UnsentTracks {
    /// A track and the saved flight it goes to.
    struct Unsent: Codable, Equatable, Sendable {
        let flight: Int
        let track: SavedTrack
    }

    private(set) var tracks: [Unsent]
    /// The last upload's failure, in its own words, while a track is unsent.
    private(set) var problem: String?
    @ObservationIgnored private var sending = false
    /// Written off the main actor (BackgroundFile).
    @ObservationIgnored private let disk: BackgroundFile

    init(file: URL) {
        disk = BackgroundFile(file)
        tracks = (try? JSONDecoder().decode([Unsent].self, from: Data(contentsOf: file))) ?? []
    }

    /// A track kept to be sent, returning once it is on the disk, so the
    /// recorder can let its own copy go after.
    func keep(_ flight: Int, _ track: SavedTrack, problem: String) async {
        tracks.append(Unsent(flight: flight, track: track))
        self.problem = problem
        disk.write(tracks)
        await disk.settled()
    }

    /// Each kept track sent with `upload`, those that went let go; a
    /// failure keeps its track and says why.
    func send(_ upload: (Int, SavedTrack) async throws -> Void) async {
        guard !sending, !tracks.isEmpty else { return }
        sending = true
        defer { sending = false }
        for unsent in tracks {
            do {
                try await upload(unsent.flight, unsent.track)
                tracks.removeAll { $0 == unsent }
            } catch {
                problem = error.localizedDescription
            }
        }
        if tracks.isEmpty { problem = nil }
        disk.write(tracks)
    }

    /// Sent once the phone has a network (Network's path monitor), or not
    /// at all while it has none; asked each time the app comes to the
    /// front, and given up with the task when it goes behind.
    func sendWhenOnline(_ upload: (Int, SavedTrack) async throws -> Void) async {
        guard !tracks.isEmpty else { return }
        for await path in NWPathMonitor() where path.status == .satisfied {
            await send(upload)
            return
        }
    }

    /// Every kept track gone, and its file (signing out, deleting the account).
    func erase() {
        tracks = []
        problem = nil
        disk.remove()
    }
}
