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
    /// The route's point the search is asked to pick, where it is: a tap on
    /// a field picks it, and the fields that cannot be picked are greyed
    /// with why (the web's SearchHome during a pick, b8887fba7); the
    /// flight's card, the airplanes and Find Nearby are left out.
    var picking: PointAsk?
    @Environment(Plan.self) private var plan
    @Environment(AirportShelf.self) private var shelf
    @Environment(Airplanes.self) private var airplanes
    @Environment(Tracking.self) private var tracking

    var body: some View {
        if plan.routed, picking == nil {
            Section {
                Button { pick(.plan) } label: { YourFlightCard() }
                    .accessibilityIdentifier("search-your-flight")
            } header: { Text("Your Flight") }
        }
        // The airplanes' Favorites and Recents after the airports', where
        // the retired traffic page kept them (the owner, 2026-11-14).
        if !shelf.favorites.isEmpty || (picking == nil && (!airplanes.records.isEmpty || !tracking.favorites.isEmpty)) {
            Section {
                ForEach(shelf.favorites) { field in keptRow(field) }
                if picking == nil {
                    ForEach(airplanes.records, id: \.tailNumber) { airplane in OwnAirplaneRow(airplane: airplane, pick: pick) }
                    ForEach(tracking.favorites) { kept in keptRow(kept) }
                }
            } header: { Text(Screen.favorites.title) }
        }
        if !shelf.recents.isEmpty || (picking == nil && !tracking.recents.isEmpty) {
            Section {
                ForEach(shelf.recents.prefix(5)) { field in keptRow(field) }
                if picking == nil { ForEach(tracking.recents.prefix(3)) { kept in keptRow(kept) } }
            } header: { Text("Recents") }
        }
        // The Stops' kinds round the airplane, each its list of fields
        // (FindNearbyView), as Maps' Find Nearby has its categories; not
        // while a point is picked, whose taps pick a field here.
        if picking == nil { findNearby }
        Section {
            if nearest.isEmpty {
                Text("Waiting for the position").foregroundStyle(.secondary)
            }
            ForEach(nearest.prefix(5)) { field in
                let refusal = refused(field.ident)
                Button { pick(.airport(field.ident)) } label: {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        NearestRow(field: field).opacity(refusal == nil ? 1 : 0.5)
                        if let refusal { RefusalLine(refusal) }
                    }
                }
                .foregroundStyle(.primary)
                .disabled(refusal != nil)
                .airportPreview(field.ident) { pick(.plan) }
            }
            if nearest.count > 5, picking == nil {
                Button("All Nearest") { pick(.airport(AirportRoute.list(.nearest).text)) }
            }
        } header: { Text(Screen.nearest.title) }
    }

    private func keptRow(_ kept: KeptAirplane) -> some View {
        Button { pick(.kept(kept)) } label: { KeptRow(kept: kept) }
            .foregroundStyle(.primary)
    }

    private func keptRow(_ field: KeptAirport) -> some View {
        let refusal = refused(field.ident)
        return Button { pick(.airport(field.ident)) } label: {
            SearchRowLabel(title: field.ident, detail: [field.name, field.municipality].compactMap { $0 }.joined(separator: " · "),
                           systemImage: WingtipIcon.departFrom, refusal: refusal)
        }
        .foregroundStyle(.primary)
        .disabled(refusal != nil)
        .airportPreview(field.ident) { pick(.plan) }
    }

    /// Why a field cannot be picked for the point asked, or nil: the
    /// fields listed here are the open ones (Nearest leaves closed fields
    /// out, decision 0043), so only one already on the route is refused.
    private func refused(_ ident: String) -> String? {
        picking.flatMap { plan.refusal(ident, closed: nil, for: $0) }
    }

    /// Find Nearby's kinds, each its list of fields round the airplane.
    private var findNearby: some View {
        Section {
            ForEach(StopKind.allCases) { kind in
                Button { pick(.airport(AirportRoute.nearby(kind).text)) } label: {
                    SettingsLabel(kind.title, systemImage: kind.systemImage, colour: kind.colour)
                }
                .foregroundStyle(.primary)
                .accessibilityIdentifier("find-nearby-\(kind.rawValue)")
            }
        } header: { Text("Find Nearby") }
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
    /// A field closed, or one to ask leave of, said first (FieldUse).
    var flag: FieldUse.Flag?
    /// Why it cannot be picked for the point the search asks, greyed
    /// under it (PointAsk); nil where it can, or nothing is picked.
    var refusal: String?

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(title).font(.headline).foregroundStyle(refusal == nil ? .primary : .secondary)
                if flag != nil {
                    FieldFlagLine(flag: flag, detail: detail)
                } else if !detail.isEmpty {
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                }
                if let refusal { RefusalLine(refusal) }
            }
        } icon: {
            Image(systemName: systemImage).foregroundStyle(.tint)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Why a field cannot be picked for the route's point the search asks
/// ("Already on the route", "Closed indefinitely"), under its greyed row.
struct RefusalLine: View {
    let words: String

    init(_ words: String) { self.words = words }

    var body: some View {
        Label(words, systemImage: "nosign")
            .font(WingtipType.note)
            .foregroundStyle(.secondary)
            .accessibilityLabel("Cannot be picked: \(words)")
    }
}
