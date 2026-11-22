import CoreLocation
import Observation
import SwiftUI

/// Where the watch is, from its own Core Location: the first fix of
/// Core Location's live updates (CLLocationUpdate.liveUpdates) within a
/// few seconds of being asked, under a service session that asks for
/// When In Use (CLServiceSession), in place of a delegate-driven
/// CLLocationManager. Nil until it has one, or where the pilot has said
/// no, when the phone's fix stands in.
@MainActor
@Observable
final class WatchLocation {
    private(set) var coordinate: CLLocationCoordinate2D?
    private(set) var denied = false

    /// How long a fix is waited for before the phone's stands in.
    static let waitS: Double = 5

    /// One fix, asked for when the screen wants one.
    func fix() async {
        let session = CLServiceSession(authorization: .whenInUse)
        defer { session.invalidate() }
        guard let update = await Self.first(within: Self.waitS) else { return }
        denied = update.authorizationDenied || update.authorizationDeniedGlobally || update.authorizationRestricted
        if let location = update.location { coordinate = location.coordinate }
    }

    /// The first update with a fix or a refusal, or nil after `waitS`.
    private nonisolated static func first(within seconds: Double) async -> CLLocationUpdate? {
        await withTaskGroup(of: CLLocationUpdate?.self) { group in
            group.addTask {
                do {
                    for try await update in CLLocationUpdate.liveUpdates()
                        where update.location != nil || update.authorizationDenied || update.authorizationDeniedGlobally || update.authorizationRestricted {
                        return update
                    }
                } catch {
                    return nil
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(seconds))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}

/// The fields nearest the pilot, nearest first, each with its distance
/// and bearing from here, as the planner works them out: the watch asks
/// the phone (WatchSession.nearest) from its own position, or from the
/// phone's last fix where it has none.
struct NearestView: View {
    @Environment(WatchSession.self) private var session
    @State private var location = WatchLocation()
    @State private var airports: [WatchAirport] = []
    @State private var problem: String?
    @State private var asking = false

    var body: some View {
        NavigationStack {
            Group {
                if let problem, airports.isEmpty {
                    ContentUnavailableView("No Airports", systemImage: "antenna.radiowaves.left.and.right.slash", description: Text(problem))
                } else if airports.isEmpty {
                    ContentUnavailableView(asking ? "Asking the iPhone…" : "Nearest Airports", systemImage: "airplane.circle", description: Text(asking ? "" : "Tap refresh to ask."))
                } else {
                    List(airports) { airport in
                        VStack(alignment: .leading) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(airport.ident).font(.headline)
                                Spacer()
                                Text(String(format: "%.1f nm", airport.distanceNm)).monospacedDigit()
                            }
                            HStack(alignment: .firstTextBaseline) {
                                Text(airport.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                Spacer()
                                Text(airport.bearingWords).font(.caption).monospacedDigit()
                            }
                            if let category = airport.flightCategory {
                                Text(category).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Nearest")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await ask() } } label: { Image(systemName: "arrow.clockwise") }
                        .disabled(asking)
                        .accessibilityLabel("Refresh")
                }
            }
            .task { await ask() }
        }
    }

    /// The watch's own position where it has one, else the phone's fix.
    private var here: (lat: Double, lon: Double)? {
        if let c = location.coordinate { return (c.latitude, c.longitude) }
        if let fix = session.context?.fix { return (fix.lat, fix.lon) }
        return nil
    }

    private func ask() async {
        guard !asking else { return }
        asking = true
        defer { asking = false }
        // The watch's own fix, waited for a few seconds; the phone's
        // stands in where none comes.
        await location.fix()
        guard let here else {
            problem = WatchProblem.noPosition.localizedDescription
            return
        }
        do {
            let reply = try await session.nearest(lat: here.lat, lon: here.lon)
            airports = reply.airports
            problem = reply.problem
        } catch {
            // The watch's own words; WatchConnectivity's are not a pilot's.
            problem = ((error as? WatchProblem) ?? .noAnswer).errorDescription
        }
    }
}
