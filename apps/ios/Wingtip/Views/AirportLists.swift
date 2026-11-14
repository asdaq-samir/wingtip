import SwiftUI

/// The fields' pages a card or the one search opens (AirportRoute): a
/// field's card, the airspace over a point, a list of fields in full, the
/// fields near a town, and the row a near field is drawn in. Each row
/// opens its field's card on the sheet's stack (SheetPage.airport).

/// What the stack opens, by its route.
struct AirportDestination: View {
    let route: AirportRoute
    let nearest: [NearestAirport]

    var body: some View {
        switch route {
        case .airport(let ident): AirportCard(ident: ident)
        case .airspace(let lat, let lon): AirspaceCard(lat: lat, lon: lon)
        case .list(.nearest): NearestView()
        case .list(let shows): AirportListView(shows: shows, nearest: nearest)
        case .nearFrom(let lat, let lon, let label): NearFromView(lat: lat, lon: lon, label: label)
        case .nearby(let kind): FindNearbyView(kind: kind)
        }
    }
}

/// A strip's list in full: the Favorites to change and put in order, the
/// Recents to take off, the nearest fields; the airplanes' after the
/// airports', with the one Edit and the one Clear (the owner, 2026-11-14,
/// the retired traffic page's lists folded in), and an airplane to keep
/// added by the one search ("Search for an airplane to keep").
struct AirportListView: View {
    @Environment(\.undoManager) private var undoManager
    @Environment(Tracking.self) private var tracking
    @Environment(Navigator.self) private var nav
    let shows: AirportShelf.Shows
    let nearest: [NearestAirport]
    @Environment(AirportShelf.self) private var shelf

    var body: some View {
        // Nearest is the one list (NearestView), wherever it is opened.
        if shows == .nearest { NearestView() } else { kept }
    }

    private var kept: some View {
        List {
            if shows == .favorites {
                if shelf.favorites.isEmpty { Text("No Favorites").foregroundStyle(.secondary) }
                ForEach(shelf.favorites) { field in NavigationLink(value: SheetPage.airport(field.ident)) { keptRow(field) }.airportPreview(field.ident).appEntityIdentifier(SiriSaw.airport(field.ident)) }
                    .onDelete { shelf.removeFavorites(at: $0, undo: undoManager) }
                    .onMove { shelf.moveFavorites(from: $0, to: $1) }
                Section("Airplanes") {
                    ForEach(tracking.favorites) { kept in airplaneRow(kept) }
                        .onDelete { at in for kept in at.map({ tracking.favorites[$0] }) { tracking.toggleFavorite(kept, undo: undoManager) } }
                    Button { nav.searchAirplane(.favorite) } label: { Label("Add an Airplane", systemImage: "plus") }
                        .accessibilityIdentifier("favorites-add-airplane")
                }
            } else {
                if shelf.recents.isEmpty, tracking.recents.isEmpty { Text("No Recents").foregroundStyle(.secondary) }
                ForEach(shelf.recents) { field in NavigationLink(value: SheetPage.airport(field.ident)) { keptRow(field) }.airportPreview(field.ident).appEntityIdentifier(SiriSaw.airport(field.ident)) }
                    .onDelete { shelf.removeRecents(at: $0) }
                if !tracking.recents.isEmpty {
                    Section("Airplanes") {
                        ForEach(tracking.recents) { kept in airplaneRow(kept) }
                            .onDelete { at in for hex in at.map({ tracking.recents[$0].hex }) { tracking.forget(recent: hex) } }
                    }
                }
            }
        }
        .navigationTitle(shows.title)
        .toolbar {
            UndoToolbarItem()
            ToolbarItemGroup(placement: .topBarTrailing) {
                if shows == .favorites, !shelf.favorites.isEmpty || !tracking.favorites.isEmpty { EditButton() }
                if shows == .recents, !shelf.recents.isEmpty || !tracking.recents.isEmpty {
                    Button("Clear") {
                        shelf.clearRecents()
                        for kept in tracking.recents { tracking.forget(recent: kept.hex) }
                    }
                }
            }
        }
    }

    /// An airplane kept: its card, tracked.
    private func airplaneRow(_ kept: KeptAirplane) -> some View {
        Button {
            tracking.track(kept.hex)
            nav.push(.traffic(kept.hex))
        } label: { KeptRow(kept: kept) }
            .foregroundStyle(.primary)
    }

    private func keptRow(_ field: KeptAirport) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text(field.ident).font(.headline)
            Text([field.name, field.municipality].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}

/// The fields nearest a town or an address typed in the search, nearest
/// first, as the planner measures them from it.
struct NearFromView: View {
    let lat: Double
    let lon: Double
    let label: String
    @State private var fields: [NearestAirport]?
    @State private var problem: String?

    var body: some View {
        List {
            if let fields {
                Section("Nearest \(label)") {
                    ForEach(fields) { field in NavigationLink(value: SheetPage.airport(field.ident)) { NearestRow(field: field) }.airportPreview(field.ident).appEntityIdentifier(SiriSaw.airport(field.ident)) }
                }
            } else if let problem {
                ProblemLine(problem)
            } else {
                // The rows' own layout, greyed by the system while they come.
                Section("Nearest \(label)") {
                    ForEach(0..<4, id: \.self) { _ in
                        LabeledContent {
                            Text("Distance")
                        } label: {
                            Text("Ident").font(.headline)
                            Text("The field's name · its longest runway")
                        }
                        .loading("Fetching the nearest fields")
                    }
                }
            }
        }
        .navigationTitle("Nearest")
        .task(id: label) {
            do { fields = try await Planner.nearest(lat: lat, lon: lon, limit: 25) } catch { problem = error.localizedDescription }
        }
    }
}

/// A field near the phone: its identifier and name, how far and which
/// way (true, as the planner gives it), and its longest runway, with its
/// flight category's colour; a private, military or joint-use field's use
/// first, the engine's (FieldUse), as the web's Nearest says it. Nearest
/// never lists a closed field (the planner's and the packs' lists are
/// open fields only, decision 0043).
struct NearestRow: View {
    let field: NearestAirport
    /// Differentiate Without Color: the category's code beside the ident,
    /// where the ring's colour alone says it otherwise.
    @Environment(\.accessibilityDifferentiateWithoutColor) private var withoutColour
    private var flag: FieldUse.Flag? { FieldUse.flag(closed: nil, use: FieldUse.code(isPrivate: field.isPrivate, military: field.military)) }

    var body: some View {
        let bearing = field.bearingDeg.truncatingRemainder(dividingBy: 360)
        HStack(spacing: WingtipSpace.md) {
            Circle().strokeBorder(Color(uiColor: FlightCategory.mark(field.flightCategory)), lineWidth: 2.5).frame(width: 12, height: 12)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                HStack(spacing: WingtipSpace.sm) {
                    Text(field.ident).font(.headline)
                    if withoutColour, let category = field.flightCategory { Text(category).font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                }
                let detail = [field.name, field.longestRunwayFt.map { Format.altitude(Double($0)) }].compactMap { $0 }.joined(separator: " · ")
                FieldFlagLine(flag: flag, detail: detail)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: WingtipSpace.xxs) {
                Text(Format.distance(field.distanceNm, decimals: 0)).font(.body.monospacedDigit())
                Text("\(Format.heading(bearing))T").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        // One row, read as a pilot would say it: the ident, its weather,
        // the field, the runway, how far and which way.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([field.ident, SpokenFigures.flightCategory(field.flightCategory), flag?.words, field.name,
                             field.longestRunwayFt.map { "longest runway \(SpokenFigures.feet(Double($0)))" },
                             SpokenFigures.nauticalMiles(field.distanceNm.rounded()), "bearing \(SpokenFigures.degrees(bearing)) true"]
                .compactMap { $0 }.joined(separator: ", "))
    }
}

private enum PreviewData {
    static let nearest = [
        NearestAirport(bearingDeg: 312, distanceNm: 3.2, flightCategory: "VFR", ident: "KDLH", kind: "large_airport",
                       lat: 46.842, lon: -92.194, longestRunwayFt: 10162, municipality: "Duluth", name: "Duluth Intl"),
        NearestAirport(bearingDeg: 174, distanceNm: 8.9, flightCategory: "MVFR", ident: "KSUW", kind: "medium_airport",
                       lat: 46.690, lon: -92.095, longestRunwayFt: 5100, municipality: "Superior", name: "Richard I Bong"),
        NearestAirport(bearingDeg: 52, distanceNm: 22.7, ident: "KTWM", kind: "small_airport", lat: 47.049, lon: -91.745,
                       longestRunwayFt: 4000, municipality: "Two Harbors", name: "Richard B Helgeson"),
    ]
}

#Preview("AirportDestination") {
    NavigationStack { AirportDestination(route: .list(.nearest), nearest: PreviewData.nearest) }
        .environment(OwnShip())
}

#Preview("AirportListView") {
    NavigationStack { AirportListView(shows: .nearest, nearest: PreviewData.nearest) }
        .environment(OwnShip())
}

#Preview("NearestRow") {
    List { ForEach(PreviewData.nearest) { NearestRow(field: $0) } }
}
