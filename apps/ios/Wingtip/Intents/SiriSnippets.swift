import CoreLocation
import SwiftUI

/// What Siri shows under its answer (ShowsSnippetView): a title and the
/// lines it said, each as the app writes it, in the app's type. Kept
/// plain, as Siri's own snippets are: no buttons, the app a tap away.
struct SiriLines: View {
    let title: String
    let lines: [String]
    var caption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Text(title).font(.headline)
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line).font(.subheadline).fixedSize(horizontal: false, vertical: true)
            }
            if let caption {
                Text(caption).font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }
}

/// Where the phone is, for an intent run without the app on the screen:
/// the first fix Core Location gives (iOS 17's live updates), within a
/// few seconds, or nil -- the pilot's position never leaves the phone
/// except as the point the planner's nearest is asked for.
enum SiriPosition {
    static let waitS: Double = 5

    static func now() async -> CLLocationCoordinate2D? {
        if let fix = await MainActor.run(body: { ReadyToFly.shared.ownShip?.fix?.coordinate }) { return fix }
        return await withTaskGroup(of: CLLocationCoordinate2D?.self) { group in
            group.addTask {
                do {
                    for try await update in CLLocationUpdate.liveUpdates() {
                        if let location = update.location { return location.coordinate }
                    }
                } catch {
                    return nil
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(waitS))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
