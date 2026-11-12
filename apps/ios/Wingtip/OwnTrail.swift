import Foundation
import Observation

/// Own ship's path flown, as ForeFlight's breadcrumbs and the web app's
/// lib/map/ownTrail: a point of the GPS every tenth of a mile or ten
/// seconds while the airplane is at flying speed (the engine's `underway`),
/// to see where it has been, and to keep as the flight's track for its
/// debrief without a GPX file. A new flight starts a new path: a point
/// more than ten minutes after the last is the first of it. Kept on the
/// phone (a file in Application Support, written at most every half
/// minute), so the app put away in the air keeps the path; at most a long
/// day's flying of it. The figures are the web's, to keep the two apps'
/// paths the same.
@MainActor
@Observable
final class OwnTrail {
    static let shared = OwnTrail()

    private static let stepNm = 0.1
    private static let stepS = 10.0
    private static let newFlightS = 10.0 * 60
    private static let most = 5000
    private static let writeEveryS = 30.0

    private(set) var points: [PathPoint] = []
    private var lastWritten: Date = .distantPast
    private var underway = false
    /// Written off the main actor (BackgroundFile).
    private let disk = BackgroundFile(OwnTrail.file)

    static var file: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("own-trail.json")
    }

    private init() {
        // The path kept from before, unless the last point is over ten
        // minutes old: that was another flight's, and a new one starts.
        if let data = try? Data(contentsOf: Self.file), let kept = try? JSONDecoder().decode([PathPoint].self, from: data),
           let last = kept.last, Date().timeIntervalSince1970 - last.t < Self.newFlightS {
            points = kept
        }
    }

    /// Whether the airplane is at flying speed, by the engine's rule
    /// (glide's underway, the same as the web's), and so whether the phone
    /// keeps its position with the screen locked (OwnShip). Where the
    /// engine cannot say, nothing is kept and the position is not held
    /// with the screen locked; the instruments bar says why (InFlight,
    /// from the same fix).
    func took(_ fix: OwnShip.Fix) -> Bool {
        let flying = (try? Flight.underway(fix.groundspeedKt)) ?? false
        underway = flying
        guard flying else { return false }
        let point = PathPoint(t: fix.at.timeIntervalSince1970, lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, altFt: fix.altitudeFt)
        if let last = points.last {
            let sinceS = point.t - last.t
            // The engine's great-circle miles (`distance_nm`); where it
            // cannot say, the point is kept, a fix too many rather than
            // a path with a gap.
            let moved = try? Engine.distanceNm(lat1: last.lat, lon1: last.lon, lat2: point.lat, lon2: point.lon)
            if sinceS < Self.stepS, let moved, moved < Self.stepNm { return true }
            points = sinceS > Self.newFlightS ? [point] : Array((points + [point]).suffix(Self.most))
        } else {
            points = [point]
        }
        if Date().timeIntervalSince(lastWritten) > Self.writeEveryS { write() }
        return true
    }

    /// The path gone from the phone, the file with it: the pilot signed
    /// out or deleted the account (Session.forgetDevice). Where they flew
    /// is theirs, not the next person's on this iPhone.
    func erase() {
        points = []
        lastWritten = .distantPast
        disk.remove()
    }

    /// The path let go: a new flight's starts empty.
    func clear() {
        points = []
        write()
    }

    /// The path as a saved flight's track (Gateway.saveTrack), where the
    /// phone flew it: t in ms since 1970, as the gateway keeps it.
    var asSavedTrack: SavedTrack {
        SavedTrack(points: points.map { SavedTrackPoint(altFt: $0.altFt, lat: $0.lat, lon: $0.lon, t: Int($0.t * 1000)) }, source: "iphone")
    }

    private func write() {
        lastWritten = Date()
        disk.write(points)
    }
}
