import Foundation

/// A track file's points with their times, as the web app's lib/track
/// reads one (the engine's `read_track`: GPX 1.1's trkpt, its ele in
/// metres, as feet, or KML's gx:Track; in time order, one a moment, the
/// unreadable dropped), then thinned to the most a saved track keeps
/// (`thin_track`). Nil where the file has no track to use.
enum GPXTrack {
    /// The engine's points: t in ms since 1970, which it writes as a
    /// fraction ("1792940400000.0"), so read as one. The contract leaves
    /// read_track's answer and thin_track's points open, so this shape is
    /// the app's, read from the engine's JSON.
    private struct Point: Codable {
        let t: Double; let lat: Double; let lon: Double; let altFt: Double?
        enum CodingKeys: String, CodingKey { case t, lat, lon, altFt = "alt_ft" }
    }

    private struct Read: Decodable {
        let points: [Point]?
        let error: String?
    }

    /// Nil where the file has no track; thrown where the engine refuses.
    static func points(_ data: Data) throws -> [SavedTrackPoint]? {
        let text = String(decoding: data, as: UTF8.self)
        let read: Read = try Engine.recoded(try Engine.readTrack(text: text))
        guard read.error == nil, let points = read.points else { return nil }
        let thinned: [Point] = try Engine.thinTrack(points: try points.map { try Engine.recoded($0) }).map { try Engine.recoded($0) }
        return thinned.map { SavedTrackPoint(altFt: $0.altFt, lat: $0.lat, lon: $0.lon, t: Int($0.t.rounded())) }
    }
}
