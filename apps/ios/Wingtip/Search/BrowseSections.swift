import SwiftUI

/// What the sheet shows with nothing typed (docs/design/rules.md §4, "Nothing
/// typed"; docs/design/ios.md §1, "Before typing"), in the system's list
/// sections: the flight as a card at the top, then Favorites (fields and
/// the pilot's airplanes), Recents, Find Nearby by the Stops' kinds and
/// Nearest. The same sections under the focused search
/// (SearchSuggestions) and in the plan before there is a route (PlanView),
/// where the medium detent otherwise showed From and To over some 300
/// points of empty glass (the iOS sheet audit, 2026-11-10).
struct BrowseSections: View {
    let nearest: [NearestAirport]
    let pick: (SearchPick) -> Void
    @Environment(Plan.self) private var plan
    @Environment(AirportShelf.self) private var shelf
    @Environment(Airplanes.self) private var airplanes

    var body: some View {
        if plan.routed {
            Section {
                Button { pick(.plan) } label: { YourFlightCard() }
                    .accessibilityIdentifier("search-your-flight")
            } header: { Text("Your Flight") }
        }
        if !shelf.favorites.isEmpty || !airplanes.records.isEmpty {
            Section {
                ForEach(shelf.favorites) { field in keptRow(field) }
                ForEach(airplanes.records, id: \.tailNumber) { airplane in OwnAirplaneRow(airplane: airplane, pick: pick) }
            } header: { Text(Screen.favorites.title) }
        }
        if !shelf.recents.isEmpty {
            Section {
                ForEach(shelf.recents.prefix(5)) { field in keptRow(field) }
            } header: { Text("Recents") }
        }
        // The Stops' kinds round the airplane, each its list of fields
        // (FindNearbyView), as Maps' Find Nearby has its categories.
        Section {
            ForEach(StopKind.allCases) { kind in
                Button { pick(.airport(AirportRoute.nearby(kind).text)) } label: {
                    SettingsLabel(kind.title, systemImage: kind.systemImage, colour: kind.colour)
                }
                .foregroundStyle(.primary)
                .accessibilityIdentifier("find-nearby-\(kind.rawValue)")
            }
        } header: { Text("Find Nearby") }
        Section {
            if nearest.isEmpty {
                Text("Waiting for the position").foregroundStyle(.secondary)
            }
            ForEach(nearest.prefix(5)) { field in
                Button { pick(.airport(field.ident)) } label: { NearestRow(field: field) }
                    .foregroundStyle(.primary)
                    .airportPreview(field.ident) { pick(.plan) }
            }
            if nearest.count > 5 {
                Button("All Nearest") { pick(.airport(AirportRoute.list(.nearest).text)) }
            }
        } header: { Text(Screen.nearest.title) }
    }

    private func keptRow(_ field: KeptAirport) -> some View {
        Button { pick(.airport(field.ident)) } label: {
            SearchRowLabel(title: field.ident, detail: [field.name, field.municipality].compactMap { $0 }.joined(separator: " · "),
                           systemImage: WingtipIcon.departFrom)
        }
        .foregroundStyle(.primary)
        .airportPreview(field.ident) { pick(.plan) }
    }
}

/// One of the pilot's own airplanes, opening its profile.
struct OwnAirplaneRow: View {
    let airplane: OwnAircraftRecord
    let pick: (SearchPick) -> Void
    @Environment(Plan.self) private var plan

    var body: some View {
        Button { pick(.airplane(airplane.tailNumber)) } label: {
            SearchRowLabel(title: airplane.tailNumber,
                           detail: plan.tail == airplane.tailNumber ? "\(airplane.typeDesignator) · Flying" : airplane.typeDesignator,
                           systemImage: WingtipIcon.airplane)
        }
        .foregroundStyle(.primary)
        .accessibilityHint("Opens its profile, with Fly This Airplane")
    }
}

/// A result's two lines, its name over what it is, read as one.
struct SearchRowLabel: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(title).font(.headline)
                if !detail.isEmpty { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
            }
        } icon: {
            Image(systemName: systemImage).foregroundStyle(.tint)
        }
        .accessibilityElement(children: .combine)
    }
}
