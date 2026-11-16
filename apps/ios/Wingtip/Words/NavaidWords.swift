import CoreLocation
import Foundation

/// What a VOR's card says of it, each the engine's rule (the web's
/// lib/navaid), asked here so the card (NavaidCard) only draws: the radial
/// a position is on (radial_of), its identifier in Morse (morse; AIM
/// 1-1-3), its standard service volume (service_volume; AIM 1-1-8) and its
/// hours (navaid_hours). Nil where NASR gives nothing or the engine cannot
/// say.
enum NavaidWords {
    static func radial(_ vor: VorPin, from fix: CLLocationCoordinate2D) -> EngineContract.RadialOfAnswer? {
        let asked = try? Engine.radialOf(station: .init(ident: vor.ident, lat: vor.lat, lon: vor.lon, magVar: vor.magVar),
                                         at: .init(lat: fix.latitude, lon: fix.longitude))
        return asked.flatMap { $0 }
    }

    static func morse(_ vor: VorPin) -> String? { try? Engine.morse(ident: vor.ident) }

    static func serviceVolume(_ vor: VorPin) -> String? { (try? Engine.serviceVolume(code: vor.serviceVolume)).flatMap { $0 } }

    static func hours(_ vor: VorPin) -> String? { (try? Engine.navaidHours(hours: vor.hours)).flatMap { $0 } }
}
