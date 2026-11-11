import CoreLocation
import Foundation

/// How far a field is, for its card's facts row, always shown (the owner,
/// 2026-11-09): from the airplane where the phone has a fix, else from
/// the plan's departure, the engine's great-circle miles (distance_nm,
/// WGS 84) either way. Nothing is measured here; with neither a fix nor
/// another departure there is no distance to give.
struct AirportDistance: Equatable {
    /// The engine's nautical miles.
    let nm: Double
    /// Where it is measured from: nil for the airplane, else the
    /// departure's ident.
    let from: String?

    /// The fact's caption: "Distance" from the airplane, as Maps' facts
    /// row reads, else "From KFDK".
    var caption: String { from.map { "From \($0)" } ?? "Distance" }

    /// What VoiceOver says of it, in full.
    var spoken: String {
        let miles = SpokenFigures.nauticalMiles(nm.rounded())
        return from.map { "\(miles) from \(SpokenFigures.digits($0))" } ?? "\(miles) from you"
    }

    static func of(lat: Double, lon: Double, ident: String, fix: CLLocationCoordinate2D?, departure: CourseEnd?) -> AirportDistance? {
        if let fix, let nm = try? Engine.distanceNm(lat1: fix.latitude, lon1: fix.longitude, lat2: lat, lon2: lon) {
            return AirportDistance(nm: nm, from: nil)
        }
        if let departure, departure.ident != ident,
           let nm = try? Engine.distanceNm(lat1: departure.lat, lon1: departure.lon, lat2: lat, lon2: lon) {
            return AirportDistance(nm: nm, from: departure.ident)
        }
        return nil
    }
}
