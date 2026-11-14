import SwiftUI

/// What a row of the one search picks, done by the sheet (PlanSheet, or
/// the strip): a field's card or a list of fields, the plan, a fix flown
/// direct to, an airplane's profile, the Airplane page for a type, or a
/// Do row.
enum SearchPick: Hashable {
    case airport(String)
    case plan
    case directTo(String)
    case airplane(String)
    case types
    case action(SearchAction)
}

/// The one search's suggestions, in the system's own list under the field
/// (`.searchSuggestions`). Nothing typed (the Main artboard): the flight,
/// then Favorites (fields and the pilot's airplanes), Recents and Nearest,
/// what the Airport and Airplane tabs listed. Typing (the Typing
/// artboard): one list grouped Airports, Waypoints and Navaids, Airplanes
/// and Do, the question for the assistant last.
struct SearchSuggestions: View {
    let model: OneSearchModel
    let pick: (SearchPick) -> Void
    @Environment(Plan.self) private var plan
    @Environment(Airplanes.self) private var airplanes

    var body: some View {
        if model.query.isEmpty { BrowseSections(nearest: model.nearest, pick: pick) } else { results }
    }

    // MARK: Typing

    @ViewBuilder private var results: some View {
        if let failed = model.failed {
            Section { ProblemLine(failed) }
        }
        if !model.airports.isEmpty || !model.towns.isEmpty {
            Section {
                ForEach(model.airports, id: \.ident) { field in
                    Button { pick(.airport(field.ident)) } label: { found(field) }
                        .foregroundStyle(.primary)

                        .airportPreview(field.ident, closed: field.closed != nil) { pick(.plan) }
                        // The UI tests' handle on a result (WingtipUITests/FlowTests).
                        .accessibilityIdentifier("airport-result-\(field.ident)")
                }
                // A town or a street address: the fields nearest it, as
                // Maps' search asks where.
                ForEach(model.towns.prefix(3)) { place in
                    Button { pick(.airport(AirportRoute.nearFrom(lat: place.lat, lon: place.lon, label: place.label).text)) } label: {
                        Label("Fields near \(place.label)", systemImage: place.kind == "address" ? "mappin" : "building.2")
                    }
                }
            } header: { Text("Airports") }
        }
        if !model.fixes.isEmpty {
            Section {
                ForEach(model.fixes, id: \.ident) { fix in
                    // A fix has no card: on a route, Direct To it.
                    Button { pick(.directTo(fix.ident)) } label: { found(fix) }
                        .foregroundStyle(.primary)
                        .disabled(!plan.routed)
                        .accessibilityHint(plan.routed ? "Direct To \(fix.ident)" : "Plan a route first for Direct To")
                }
            } header: { Text("Waypoints and Navaids") }
        }
        let own = model.ownMatching(airplanes.records)
        let tail = model.typedTail(airplanes.records)
        let types = model.matchingTypes
        if !own.isEmpty || tail != nil || !types.isEmpty {
            Section {
                ForEach(own, id: \.tailNumber) { airplane in OwnAirplaneRow(airplane: airplane, pick: pick) }
                if let tail {
                    Button { pick(.airplane(tail)) } label: {
                        row(tail, model.registered.map(Self.registryLine) ?? "FAA registry", systemImage: WingtipIcon.airplane)
                    }
                    .foregroundStyle(.primary)
                    .accessibilityHint("Opens its profile, with Fly This Airplane")
                }
                ForEach(types, id: \.name) { type in
                    Button { pick(.types) } label: {
                        row(type.type ?? type.designator ?? type.name.uppercased(), "A type the planner has figures for", systemImage: WingtipIcon.airplane)
                    }
                    .foregroundStyle(.primary)
                }
            } header: { Text("Airplanes") }
        }
        Section {
            ForEach(model.actions(routed: plan.routed)) { action in
                Button { pick(.action(action)) } label: { Label(action.title, systemImage: action.systemImage) }
                    .accessibilityIdentifier("search-do-\(action.id)")
            }
        } header: { Text("Do") }
    }

    // MARK: Rows

    /// A field found, its closed label or its use first ("Closed
    /// indefinitely · Cooper Flying Service", "Private · Ravenwood").
    private func found(_ field: AirportSuggestion) -> some View {
        SearchRowLabel(title: field.ident, detail: [field.name, field.municipality, field.region].compactMap { $0 }.joined(separator: " · "),
                       systemImage: field.kind == "fix" ? WingtipIcon.waypoint : WingtipIcon.departFrom,
                       flag: FieldUse.flag(closed: field.closed, use: field.use))
    }

    /// A result's two lines (SearchRowLabel).
    private func row(_ title: String, _ detail: String, systemImage: String) -> some View {
        SearchRowLabel(title: title, detail: detail, systemImage: systemImage)
    }

    /// The registry's make and model, as the FAA writes them.
    static func registryLine(_ registration: AircraftRegistration) -> String {
        let name = [registration.manufacturer, registration.model].compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }.joined(separator: " ")
        return name.isEmpty ? "FAA registry" : "\(name) · FAA registry"
    }
}

/// The flight at the top of the search with nothing typed (the Main
/// artboard's "Your flight"): the route and its figures as the strip
/// shows them, the engine's, and the airplane; tapped, the plan.
struct YourFlightCard: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Text(plan.idents.joined(separator: " → ")).font(.headline).foregroundStyle(.primary)
            FiguresStrip().allowsHitTesting(false)
            if let name = plan.airplaneName {
                Text(plan.altitudeFt.map { "\(name) · \(Format.cruiseAltitude($0))" } ?? name)
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows the plan")
    }
}
