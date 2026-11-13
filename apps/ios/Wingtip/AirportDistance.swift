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

    /// From the airplane, else from the departure; nil with neither (or
    /// on the departure's own card); thrown where the engine cannot
    /// measure, said under the facts rather than shown as no distance.
    static func of(lat: Double, lon: Double, ident: String, fix: CLLocationCoordinate2D?, departure: CourseEnd?) throws -> AirportDistance? {
        let field = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        if let fix { return AirportDistance(nm: try Flight.distanceNm(fix, field), from: nil) }
        if let departure, departure.ident != ident {
            return AirportDistance(nm: try Flight.distanceNm(CLLocationCoordinate2D(latitude: departure.lat, longitude: departure.lon), field), from: departure.ident)
        }
        return nil
    }
}
