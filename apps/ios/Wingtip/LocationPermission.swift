import CoreLocation
import Foundation
import Observation

/// The position's permission, read in one place: what iOS last said of it
/// and the system's question asked once. Own ship's fixes come from
/// CLLocationUpdate.liveUpdates (OwnShip), which has no status of its own
/// until it runs, and running it asks; so this one manager is kept only to
/// read the status and ask, where Ready to Fly and the permission pages
/// made a CLLocationManager each time they wanted to know (the stock
/// audit, 2026-11-21). Its callback is iOS 14's
/// locationManagerDidChangeAuthorization, not the deprecated one.
@MainActor
@Observable
final class LocationPermission: NSObject, CLLocationManagerDelegate {
    static let shared = LocationPermission()

    private(set) var status: CLAuthorizationStatus
    @ObservationIgnored private let manager: CLLocationManager
    /// Told of each change, after `status` (OwnShip starts its updates on
    /// an allow).
    @ObservationIgnored var onChange: ((CLAuthorizationStatus) -> Void)?

    override private init() {
        let manager = CLLocationManager()
        self.manager = manager
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
    }

    /// Not asked yet: iOS asks once and ignores the rest.
    var undecided: Bool { status == .notDetermined }
    var denied: Bool { status == .denied || status == .restricted }
    var allowed: Bool { status == .authorizedWhenInUse || status == .authorizedAlways }

    /// The system's question, the first time the pilot asks for something
    /// that needs the position (HIG Onboarding, docs/design/ios.md §14).
    func ask() {
        guard undecided else { return }
        manager.requestWhenInUseAuthorization()
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.status = status
            self.onChange?(status)
        }
    }
}
