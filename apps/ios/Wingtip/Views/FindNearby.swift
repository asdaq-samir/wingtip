import SwiftUI

/// What the map's Stops look for at a field, as the web's lib/stopKinds
/// names them, each in its badge colour (design/tokens.json's
/// color.badge.stop-*, the owner's picks on the Stops canvas, 2026-10-27).
/// Find Nearby lists one kind round the pilot (docs/design/ios.md §1).
enum StopKind: String, CaseIterable, Identifiable, Sendable {
    case fuel, food, repair, training

    var id: String { rawValue }

    var title: String {
        switch self {
        case .fuel: "Fuel"
        case .food: "Food"
        case .repair: "Repair"
        case .training: "Flight Training"
        }
    }

    var systemImage: String {
        switch self {
        case .fuel: "fuelpump"
        case .food: "fork.knife"
        case .repair: "wrench.and.screwdriver"
        case .training: "graduationcap"
        }
    }

    var colour: UIColor {
        switch self {
        case .fuel: WingtipColor.Badge.stopFuel
        case .food: WingtipColor.Badge.stopFood
        case .repair: WingtipColor.Badge.stopRepair
        case .training: WingtipColor.Badge.stopTraining
        }
    }

    /// Whether the planner's answer lists this kind at the field: the fuel
    /// it sells and its repair (the Chart Supplement's, NASR APT_BASE), its
    /// places to eat and its schools (Overture), as the web's kindsOf reads
    /// the same fields.
    func at(_ field: APIStopField) -> Bool {
        switch self {
        case .fuel: !(field.fuelTypes ?? []).isEmpty
        case .food: !(field.food ?? []).isEmpty
        case .repair: field.airframeRepair != nil || field.powerplantRepair != nil
        case .training: !(field.training ?? []).isEmpty
        }
    }
}

extension Planner {
    /// The public fields round a point with fuel, food, repair or a flight
    /// school, nearest first (/api/stops/near), out to `nm`.
    static func stopsNear(lat: Double, lon: Double, nm: Double = 25) async throws -> APIStopFields {
        try await call { try await $0.stopsNear(query: .init(lat: lat, lon: lon, nm: nm.rounded(.towardZero))).ok.body.json }
    }
}

/// One kind's fields round the airplane, nearest first, each opening its
/// card; its problem said in place, with Try Again (lib/problems).
struct FindNearbyView: View {
    let kind: StopKind
    @Environment(OwnShip.self) private var ownShip
    @State private var fields: [APIStopField]?
    @State private var problem: String?

    var body: some View {
        List {
            if ownShip.fix == nil {
                ContentUnavailableView("Finding your position…", systemImage: "location", description: Text("Find Nearby is from where the airplane is."))
            } else if let problem {
                Section {
                    ProblemLine(problem)
                    Button("Try Again") { Task { await load() } }
                }
            } else if let fields {
                let found = fields.filter(kind.at)
                if found.isEmpty {
                    ContentUnavailableView("No \(kind.title) Within 25 nm", systemImage: kind.systemImage)
                }
                ForEach(found, id: \.ident) { field in
                    NavigationLink(value: SheetPage.airport(field.ident)) {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text(field.ident).font(.headline)
                            Text([field.name, Format.distance(field.distanceNm, decimals: 0)].joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            } else {
                Section { ForEach(0..<4, id: \.self) { _ in LabeledContent("KXXX", value: "00 nm").loading("Fetching \(kind.title)") } }
            }
        }
        .navigationTitle(kind.title)
        .onAppear { ownShip.askLocation() }
        .task(id: ownShip.fix.map { "\(($0.coordinate.latitude * 60).rounded()),\(($0.coordinate.longitude * 60).rounded())" }) { await load() }
    }

    private func load() async {
        guard let at = ownShip.fix?.coordinate else { return }
        problem = nil
        do { fields = try await Planner.stopsNear(lat: at.latitude, lon: at.longitude).fields } catch { problem = error.localizedDescription }
    }
}
