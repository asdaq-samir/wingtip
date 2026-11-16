import SwiftUI

/// A plate's card, a tap on its page on the map opening it (ForeFlight's
/// plate card, the owner's screenshot, 2026-11-11): the plate's name, Hide
/// Plate and View Full Screen side by side, the tags on the approach's
/// fixes and the night's inverted colours as switches, and how solid the
/// page is on a slider from clear to solid. The card rule's one card over
/// the search, its close at the right (docs/design/rules.md).
struct PlateCard: View {
    @Environment(Navigator.self) private var nav
    let key: String
    @AppStorage(PlateLook.Keys.opacity) private var opacity = PlateLook.defaultOpacity
    @AppStorage(PlateLook.Keys.inverted) private var inverted = false
    @AppStorage(PlateLook.Keys.annotations) private var annotations = true
    @State private var model = PlateCardModel()
    @State private var shown: ShownPicture?

    private var ident: String { PlateKey.parts(key)?.ident ?? key }

    var body: some View {
        List {
            Section {
                HStack(spacing: WingtipSpace.sm) {
                    Button {
                        // The plate off the map, its approach still on the route.
                        HiddenPlates.shared.hide(key)
                        nav.close()
                    } label: {
                        Text("Hide Plate").frame(maxWidth: .infinity)
                    }
                    .accessibilityIdentifier("plate-hide")
                    Button {
                        shown = model.fullScreen(key: key, title: title)
                    } label: {
                        Text("View Full Screen").frame(maxWidth: .infinity)
                    }
                    .disabled(model.plate == nil)
                    .accessibilityIdentifier("plate-full-screen")
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                // Why View Full Screen is off, where it happened (IOS-6).
                if let problem = model.problem { ProblemLine(problem) }
            }
            Section {
                Toggle("Show Annotations", isOn: $annotations)
                Toggle("Invert Plate Colors", isOn: $inverted)
                // Continuous, so a slider (the owner circled ForeFlight's):
                // its ends a clear page and a solid one.
                Slider(value: $opacity, in: PlateLook.leastOpacity...1) {
                    Text("Transparency")
                } minimumValueLabel: {
                    Image(systemName: "square.dashed").accessibilityLabel("Clear")
                } maximumValueLabel: {
                    Image(systemName: "square.fill").accessibilityLabel("Solid")
                }
                .accessibilityValue(Text("\(Int((opacity * 100).rounded())) percent solid"))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: key) { await model.load(key) }
        .fullScreenCover(item: $shown) { PictureViewer(picture: $0) }
    }

    private var title: String {
        PlateKey.title(ident: ident, name: model.plate?.name ?? PlateKey.parts(key)?.procedure ?? "")
    }
}

/// What the plate's card asks the planner: the plate as placed (its FAA
/// name) and, for View Full Screen, the d-TPP chart of that name among the
/// field's charts, so the viewer shows every page of it.
@MainActor @Observable
final class PlateCardModel {
    private(set) var plate: PlateOverlay?
    private(set) var chartURL: String?
    /// Why the plate could not be had, said under the buttons.
    private(set) var problem: String?

    func load(_ key: String) async {
        guard let parts = PlateKey.parts(key) else { return }
        do {
            plate = try await Planner.plate(parts.ident, procedure: parts.procedure)
            problem = nil
        } catch {
            plate = nil
            problem = "The plate couldn't be fetched: \(error.localizedDescription)"
        }
        guard let name = plate?.name, let place = try? await Planner.place(parts.ident) else { return }
        chartURL = Self.chart(named: name, in: place.procedures ?? [])?.url
    }

    /// The field's chart the plate is, by the FAA's own title.
    static func chart(named name: String, in charts: [TerminalChart]) -> TerminalChart? {
        charts.first { $0.kind == "IAP" && $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// The plate full screen in the app's plate viewer: the FAA's chart's
    /// pages where the field lists it, else the page the map draws; own
    /// ship on its first page where the planner placed the page
    /// (PlatePage.georeference, PlatePosition). The engine's fractions are
    /// of the whole page, so they hold for the FAA's page and the map's
    /// page picture alike; the plan view alone (no page placed) has none.
    func fullScreen(key: String, title: String) -> ShownPicture? {
        guard let parts = PlateKey.parts(key) else { return nil }
        var shown: ShownPicture
        if let chartURL {
            shown = .faaChart(title, url: chartURL, airport: parts.ident)
        } else if let plate {
            shown = .paths(title, [PlatePlacement.picturePath(plate, ident: parts.ident, procedure: parts.procedure)])
        } else {
            return nil
        }
        shown.georeference = plate?.page?.georeference
        return shown
    }
}

#Preview("PlateCard") {
    NavigationStack { PlateCard(key: "KOSH:I36") }
}
