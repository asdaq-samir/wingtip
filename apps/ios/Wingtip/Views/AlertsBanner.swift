import SwiftUI

/// What is ahead on the track, over the map as the web app's AlertsBanner
/// has it: the planner's alerts in its words, the nearest first, red
/// where it says so and amber otherwise, with the minutes to it. Tapped,
/// the airspace card where it is (AlertActions); held, each one's.
struct AlertsBanner: View {
    @Environment(\.appCommand) private var appCommand
    let alerts: [AheadAlert]

    var body: some View {
        let sorted = alerts.sorted(by: { $0.seconds < $1.seconds })
        if let first = sorted.first {
            Button { appCommand(AlertActions.command(AlertActions.target(first))) } label: { line(first) }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the airspace where it is")
                .contextMenu {
                    ForEach(sorted) { alert in
                        Button(alert.name, systemImage: "info.circle") { appCommand(AlertActions.command(AlertActions.target(alert))) }
                    }
                }
        }
    }

    private func line(_ first: AheadAlert) -> some View {
        HStack(spacing: WingtipSpace.sm) {
            // The octagon and the triangle tell the two levels apart
            // without their colours; VoiceOver says the level.
            let danger = first.level == "stop" || first.level == "danger"
            Image(systemName: danger ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill")
                .accessibilityLabel(danger ? "Danger ahead" : "Caution ahead")
                // It rings each time a new alert comes to the front.
                .symbolRing(on: first.id)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(first.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text("\(first.need) · \(Format.duration(first.seconds / 60)), \(Format.distance(first.distanceNm))").font(.footnote).lineLimit(1)
                    .accessibilityLabel("\(first.need), in \(SpokenFigures.minutes(first.seconds / 60)), \(SpokenFigures.nauticalMiles(first.distanceNm))")
            }
            Spacer(minLength: 0)
            if alerts.count > 1 {
                Text("+\(alerts.count - 1)").font(.footnote.weight(.semibold))
                    .accessibilityLabel("and \(alerts.count - 1) more")
            }
        }
        .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
        .foregroundStyle(.white)
        .background(first.level == "stop" || first.level == "danger" ? Color.red : Color.orange, in: RoundedRectangle(cornerRadius: WingtipRadius.banner))
        .padding(.horizontal, WingtipSpace.md)
        .padding(.top, WingtipSpace.sm)
        .accessibilityElement(children: .combine)
    }
}

#Preview("AlertsBanner") {
    VStack(spacing: 0) {
        AlertsBanner(alerts: [
            AheadAlert(distanceNm: 3.4, id: "sua-R-4305", kind: "sua", lat: 46.9, level: "stop", lon: -92.4, name: "R-4305",
                       need: "Restricted: keep out unless the controlling agency clears you", seconds: 180),
            AheadAlert(airspaceClass: "D", distanceNm: 4.6, id: "airspace-D-KDLH", kind: "airspace", lat: 46.84, level: "caution", lon: -92.19,
                       name: "Duluth Class D", need: "Two-way radio contact with the tower before entering", seconds: 240),
        ])
        AlertsBanner(alerts: [
            AheadAlert(clearanceFt: 420, distanceNm: 1.5, id: "terrain", kind: "terrain", lat: 46.9, level: "caution", lon: -92.4, name: "Terrain",
                       need: "Within 500 ft of the ground in a minute", seconds: 50),
        ])
        Spacer()
    }
}
