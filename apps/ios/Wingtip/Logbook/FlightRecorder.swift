import Foundation
import Observation

/// The flight the phone's own GPS records (never a dry run's), kept on
/// the phone until it is logged or let go: what the engine draws the
/// logbook entry from (logbook_from_track), as the web's
/// features/logbook-auto/recorder. Nothing of it leaves the phone until
/// the pilot confirms the entry, and then only to the planner for the
/// draft and, where they link a saved flight, to that flight's debrief.
///
/// Before the airplane first reaches flying speed (the engine's
/// `underway`) only the last ten minutes are kept, the taxi and the
/// takeoff roll that 14 CFR 1.1's flight time starts with; from then on
/// every point, and the phone keeps reading its position in the
/// background (the location background mode, OwnShip) until the engine
/// finds the flight has ended.
@MainActor
@Observable
final class FlightRecorder {
    typealias Point = EngineContract.TrackPoint

    /// A point every 5 s: four hours are under 3,000 points, and the
    /// planner's 5,000 is never reached (the web's EVERY_MS, MOST_POINTS).
    nonisolated static let everyMs = 5_000.0
    nonisolated static let most = 5_000
    /// The engine reads the track at most once a minute of points: whether
    /// the flight has ended is a question of minutes.
    nonisolated static let lookEvery = 12
    /// Before flying speed, the minutes of taxi kept.
    nonisolated static let groundKeptMs = 10 * 60 * 1000.0
    private static let writeEveryS = 30.0
    /// Before flying speed, how often the file is written: what a kill
    /// then loses is a little taxi, where every 30 s rewrote ten minutes
    /// of a parked airplane's points (Android's GROUND_WRITE_EVERY_MS).
    nonisolated static let groundWriteEveryS = 5 * 60.0

    /// What is kept on the phone between launches.
    nonisolated struct Kept: Codable, Equatable, Sendable {
        var points: [Point] = []
        /// The end of the flight time last offered (the engine's block.to),
        /// so a draft let go is not offered again until a later landing.
        var askedTo: Double?
        /// Whether the airplane has reached flying speed in these points.
        var flown = false
    }

    private(set) var kept: Kept
    /// The end of a flight that has landed and come to rest, not yet
    /// offered: the sheet opens on it.
    private(set) var endedAt: Double?
    @ObservationIgnored private var lastWritten = Date.distantPast
    /// The track kept from before read (load), or made moot by a forget
    /// or an erase: until then nothing is written, so a fix taken in the
    /// moment before the read does not write over the flight on the disk.
    @ObservationIgnored private var loaded = false
    @ObservationIgnored private var loading: Task<Void, Never>?
    /// The engine's reading of the track under way (look), off the main actor.
    @ObservationIgnored private var looking: Task<Void, Never>?
    /// Written off the main actor (BackgroundFile).
    @ObservationIgnored private let disk: BackgroundFile
    /// The logged tracks not yet sent to their saved flight, in a file
    /// beside this one: kept until they are, and erased with it.
    let unsent: UnsentTracks

    init(file: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "flight-recorder.json")) {
        disk = BackgroundFile(file)
        unsent = UnsentTracks(file: file.deletingPathExtension().appendingPathExtension("unsent.json"))
        kept = Kept()
    }

    /// The track kept from before, read off the main actor once, after the
    /// app's first frame (ScreenModels.loadKept): four hours are some
    /// 3,000 points, which the launch decoded on the main thread before
    /// it drew anything. Any points taken meanwhile go on after it.
    func load() async {
        if loading == nil { loading = Task { await read() } }
        await loading?.value
    }

    private func read() async {
        let before = await disk.read(Kept.self)
        await unsent.load()
        guard !loaded else { return }
        loaded = true
        if let before { kept = Self.joined(before, kept) }
        look()
    }

    /// The track read from the disk with the points taken while it was
    /// being read after it, at most `most` of them.
    nonisolated static func joined(_ before: Kept, _ now: Kept) -> Kept {
        let after = now.points.filter { $0.t > before.points.last?.t ?? -.infinity }
        return Kept(points: Array((before.points + after).suffix(most)), askedTo: before.askedTo ?? now.askedTo,
                    flown: before.flown || now.flown)
    }

    var points: [Point] { kept.points }

    /// A fix of the phone's GPS into the track, at most one per `everyMs`;
    /// whether the phone should keep reading its position in the
    /// background for it (a flight under way, not yet ended).
    @discardableResult
    func took(_ fix: OwnShip.Fix) -> Bool {
        let t = fix.at.timeIntervalSince1970 * 1000
        if let last = kept.points.last, t - last.t < Self.everyMs { return wantsBackground }
        guard kept.points.count < Self.most else { return wantsBackground }
        let takeoff = !kept.flown && (try? Flight.underway(fix.groundspeedKt)) == true
        if takeoff { kept.flown = true }
        kept.points.append(Point(t: t, lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, altFt: fix.altitudeFt))
        if !kept.flown { kept.points.removeAll { t - $0.t > Self.groundKeptMs } }
        if kept.points.count % Self.lookEvery == 0 { look() }
        if takeoff || Date().timeIntervalSince(lastWritten) >= (kept.flown ? Self.writeEveryS : Self.groundWriteEveryS) { write() }
        return wantsBackground
    }

    /// A flight under way and not yet ended.
    var wantsBackground: Bool { kept.flown && endedAt == nil }

    /// The engine's own reading of the track on the phone: has a flight
    /// landed and come to rest? Read off the main actor (the engine has no
    /// thread of its own, and reads the whole track, some 3,000 points
    /// four hours in), a newer look cancelling one not yet answered.
    private func look() {
        looking?.cancel()
        guard kept.flown, kept.points.count >= 2 else { endedAt = nil; return }
        let (points, askedTo) = (kept.points, kept.askedTo)
        looking = Task { [weak self] in
            let ended = await Self.ended(points, askedTo: askedTo)
            guard !Task.isCancelled else { return }
            self?.endedAt = ended
        }
    }

    @concurrent
    private nonisolated static func ended(_ points: [Point], askedTo: Double?) async -> Double? {
        flightEnded(try? Engine.logbookFromTrack(points: points), points: points, askedTo: askedTo)
    }

    /// Whether the recorded flight has ended, by the engine's reading of
    /// the track (the web's flightEnded): a landing in it, the track not
    /// ending in the air, and the flight time over (the engine's block ends
    /// where the airplane came to rest after landing, 14 CFR 1.1) before
    /// the last point. Past `askedTo`, so a draft let go is not offered again.
    nonisolated static func flightEnded(_ answer: EngineContract.LogbookFromTrackAnswer?, points: [Point], askedTo: Double?) -> Double? {
        guard let answer, let last = points.last, !answer.endsAirborne, !answer.landings.isEmpty,
              let to = answer.block.to, to < last.t else { return nil }
        if let askedTo, to <= askedTo { return nil }
        return to
    }

    /// Not now: kept recording, and not offered again until a later landing.
    func later() {
        guard let endedAt else { return }
        looking?.cancel()
        kept.askedTo = endedAt
        self.endedAt = nil
        write()
    }

    /// The track let go: logged, or not a flight to log.
    func forget() {
        looking?.cancel()
        loaded = true
        kept = Kept()
        endedAt = nil
        write()
    }

    /// The track gone from the phone, its file with it, and the tracks not
    /// yet sent: the pilot signed out or deleted the account
    /// (Session.forgetDevice).
    func erase() {
        looking?.cancel()
        loaded = true
        kept = Kept()
        endedAt = nil
        disk.remove()
        unsent.erase()
    }

    private func write() {
        guard loaded else { return }
        lastWritten = Date()
        disk.write(kept)
    }
}
