import SwiftUI

/// Charts: the airport diagram and the Chart Supplement, then the field's
/// approaches, departures, arrivals and minimums in this cycle's d-TPP,
/// each shown in the app full screen to pinch in on. A procedure's title
/// as the FAA prints it, as pilots know it from the plate.
struct AirportChartsTab: View {
    let place: AirportPlace
    @Binding var shown: ShownPicture?
    /// The diagram with the airplane on it (DiagramOwnShipView), open.
    @State private var ownShipDiagram = false
    @Environment(FieldNotams.self) private var notams

    /// The groups by the FAA's chart codes (wingtip.publications); the
    /// airport's own -- hot spots, land and hold short -- go with its
    /// diagram.
    static let groups: [(title: String, kinds: [String])] = [
        ("Approaches", ["IAP"]), ("Departures", ["DP", "ODP"]), ("Arrivals", ["STR"]), ("Minimums", ["MIN"]),
    ]
    static let airportCharts = ["HOT", "LAH"]

    struct ChartGroup: Identifiable {
        let title: String
        let charts: [TerminalChart]
        var id: String { title }
    }

    /// The rest of the charts, in groups, with "Other" for any code the
    /// groups leave out.
    static func grouped(_ charts: [TerminalChart]) -> [ChartGroup] {
        let known = Set(["APD"] + airportCharts + groups.flatMap { $0.kinds })
        let other = (title: "Other", kinds: Array(Set(charts.map { $0.kind }).subtracting(known)).sorted())
        return (groups + [other]).compactMap { group in
            let mine = charts.filter { group.kinds.contains($0.kind) }
            return mine.isEmpty ? nil : ChartGroup(title: group.title, charts: mine)
        }
    }

    struct PublicationNote: Equatable {
        let title: String
        var detail: String?
    }

    /// Where the FAA could not give the card its plates or its Chart
    /// Supplement page (the planner's `publications`): an outage said in
    /// place of the empty list, not read as a field with none; a kept
    /// earlier cycle shown in its place named. The web's publicationNotes.
    static func publicationNotes(_ place: AirportPlace) -> [PublicationNote] {
        let editions = [("Plates", place.publications?.plates), ("Chart Supplement", place.publications?.supplement)]
        return editions.compactMap { what, edition -> PublicationNote? in
            if edition?.state == "unavailable" { return PublicationNote(title: "\(what) couldn't be fetched from the FAA") }
            guard edition?.state == "kept", let cycle = edition?.edition else { return nil }
            return PublicationNote(title: "\(what) from kept cycle \(cycle)", detail: "The cycle in force couldn't be fetched from the FAA")
        }
    }

    /// The sketch full screen, for a field the FAA draws no diagram for.
    @MainActor
    static func sketch(_ place: AirportPlace) -> ShownPicture {
        let renderer = ImageRenderer(content: RunwaySketch(runways: place.runways)
            .frame(width: 900, height: 900).background(Color.white).environment(\.colorScheme, .light))
        renderer.scale = 2
        let image = renderer.uiImage
        return ShownPicture(title: "\(place.ident) Runways") { image.map { [$0] } ?? [] }
    }

    var body: some View {
        let charts = place.procedures ?? []
        let sketched = !RunwaySketch.strips(place.runways).isEmpty
        Section("Airport") {
            ForEach(Self.publicationNotes(place), id: \.title) { note in
                VStack(alignment: .leading) {
                    Text(note.title)
                    if let detail = note.detail { Text(detail).font(.footnote) }
                }
                .foregroundStyle(.secondary)
            }
            if let cycle = place.airportDiagramCycle {
                row("Airport Diagram", "map") {
                    shown = .paths("\(place.ident) airport diagram", [Planner.diagramPath(ident: place.ident, cycle: cycle)])
                }
            } else if let url = place.airportDiagramUrl {
                row("Airport Diagram", "map") { shown = .faaChart("\(place.ident) Airport Diagram", url: url, airport: place.ident) }
            } else if sketched {
                row("Airport Diagram", "map", detail: "A sketch of the runways: the FAA publishes none") { shown = Self.sketch(place) }
            } else if place.publications?.plates?.state != "unavailable" {
                Text("The FAA publishes no airport diagram for this field").foregroundStyle(.secondary)
            }
            // The FAA's diagram with the airplane on it, by the diagram's
            // own latitude and longitude marks (#218), under the diagram.
            if let url = place.airportDiagramUrl {
                row("Diagram with Your Position", "location.north.circle") { ownShipDiagram = true }
                    .fullScreenCover(isPresented: $ownShipDiagram) { DiagramOwnShipView(place: place, url: url) }
            }
            if let supplement = place.chartSupplementUrl {
                row("Chart Supplement", "book") { shown = .faaChart("\(place.ident) Chart Supplement", url: supplement, airport: place.ident) }
            }
            ForEach(charts.filter { Self.airportCharts.contains($0.kind) }) { chart in chartRow(chart) }
        }
        ForEach(Self.grouped(charts)) { group in
            Section(group.title) {
                ForEach(group.charts) { chart in chartRow(chart) }
            }
        }
    }

    /// A chart's row, opening the plate; an approach a NOTAM in force
    /// addresses (notam_subject: its ILS's part out, an FDC NOTAM's
    /// minimums) has the NOTAM's badge after it, a tap of its own opening
    /// that NOTAM, as the row's tap is the plate's.
    @ViewBuilder
    private func chartRow(_ chart: TerminalChart) -> some View {
        let symbol = chart.kind == "IAP" ? "airplane.arrival" : chart.kind == "DP" || chart.kind == "ODP" ? "airplane.departure"
            : chart.kind == "STR" ? "point.topleft.down.to.point.bottomright.curvepath" : "doc.richtext"
        // The FAA's capitalised name in sentence case, its codes kept
        // ("ILS or LOC RWY 36" reads "ILS or LOC rwy 36"): faa_words.
        let plate = row(AirportWords.faaWords(chart.name), symbol, colour: chart.kind == "IAP" || chart.kind == "DP" || chart.kind == "ODP" || chart.kind == "STR" ? Badge.approach : Badge.chart) {
            shown = .faaChart(chart.name, url: chart.url, airport: place.ident)
        }
        // A secondary click or a long press: the plate in a window of its
        // own beside the map, on an iPad with windows (OpenInWindowItem).
        .contextMenu { OpenInWindowItem(request: PictureRequest(title: chart.name, source: .faaChart(url: chart.url, airport: place.ident))) }
        if let mark = notams.marks.approach[chart.url] {
            HStack(spacing: WingtipSpace.sm) {
                plate.buttonStyle(.borderless)
                Button { notams.opened = mark.open } label: { NotamMarkBadge(mark: mark) }
                    .buttonStyle(.borderless)
                    .hitArea()
                    .accessibilityHint("Opens its NOTAM")
            }
        } else {
            plate
        }
    }

    private func row(_ title: String, _ symbol: String, detail: String? = nil, colour: Color = Badge.chart, open: @escaping () -> Void) -> some View {
        Button(action: open) {
            HStack {
                CardRow(badge: RowBadge(systemImage: symbol, colour: colour), title: title, detail: detail)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .foregroundStyle(.primary)
    }
}
