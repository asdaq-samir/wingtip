import CoreLocation
import Foundation

/// Whose position own ship is: the device's (Core Location) or the
/// cockpit receiver's GPS, as the engine's `receiver_position` weighs them.
/// A Wi-Fi iPad has no GPS, so in the air the receiver's is all it has; a
/// phone keeps its own unless the receiver's is clearly better, and takes
/// its own back the moment the receiver's goes stale. Nothing is judged
/// here: the NIC and NACp floor, the three seconds and the margin are the
/// engine's.
enum OwnShipSource: String, Sendable {
    case device, receiver, none

    /// What the engine says of the receiver's fix and which to show.
    struct Weighed: Equatable, Sendable {
        let source: OwnShipSource
        /// "good", or why the receiver's is not used: "none", "no_gps",
        /// "stale", "weak" (the engine's).
        let receiver: String
        let fix: OwnShip.Fix?
    }

    /// The engine asked; nil where it could not answer, and nothing changes.
    static func weigh(own: EngineContract.ReceiverOwnship?, receiver: EngineContract.ReceiverState?, device: OwnShip.Fix?,
                      was: OwnShipSource, now: Date = Date()) -> Weighed? {
        let deviceIn = device.flatMap { d in
            d.accuracyM >= 0 ? EngineContract.ReceiverPositionInputDevice(accuracyM: d.accuracyM, at: d.at.timeIntervalSince1970) : nil
        }
        guard let answer = try? Engine.receiverPosition(ownship: own, receiver: receiver, device: deviceIn, was: was.rawValue,
                                                        at: now.timeIntervalSince1970) else { return nil }
        let source = OwnShipSource(rawValue: answer.source) ?? .device
        return Weighed(source: source, receiver: answer.receiver, fix: answer.fix.map(fix))
    }

    /// The receiver's fix as own ship's. Its height is the GPS's MSL where
    /// the receiver gives one; a receiver that gives the ellipsoid's
    /// leaves none (iOS has no geoid model to convert it), which the
    /// screens show as not known rather than a height 100 ft out.
    static func fix(_ f: EngineContract.ReceiverPositionAnswerFix) -> OwnShip.Fix {
        OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: f.lat, longitude: f.lon), altitudeFt: f.altitudeFt,
                    trackDeg: f.trackDeg, groundspeedKt: f.groundspeedKt, accuracyM: f.accuracyM,
                    at: Date(timeIntervalSince1970: f.at))
    }

    /// The words for the map's receiver chip and the setting: whose
    /// position is shown, or why the receiver's is not.
    static func words(_ weighed: Weighed?, name: String) -> String? {
        guard let weighed else { return nil }
        if weighed.source == .receiver { return "Your position from \(name)" }
        switch weighed.receiver {
        case "no_gps": return "\(name) has no GPS fix"
        case "weak": return "\(name)'s GPS too weak to show"
        default: return nil
        }
    }
}
