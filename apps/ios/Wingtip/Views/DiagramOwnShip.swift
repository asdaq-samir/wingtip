import PDFKit
import SwiftUI

/// The FAA's airport diagram with the airplane on it (#218): the d-TPP's
/// PDF drawn on the phone, and own ship placed by the diagram's own
/// latitude and longitude labels (the engine's diagram_labels,
/// diagram_graticule and diagram_point; the free d-TPP's diagrams carry
/// no GeoPDF georeference). PDFKit reads the page's text and where each
/// label is drawn; the engine does the rest. A diagram with no labels
/// (KORD's) is shown without the airplane, and says so. The page is
/// PDFKit's own view (DiagramPDFView), vector-sharp at any zoom, own ship
/// an annotation on it that moves with the page.
///
/// For a pilot's awareness on the ground, not for navigation: the signs,
/// the markings and ATC's taxi instructions are what count (AC 120-74B;
/// AC 120-76D 11.17.1, "use of external visual references is sufficient
/// for maneuvering" on the ground), and the sheet says it is a planning
/// aid. Own ship follows AC 120-76D 11.17.2: a circle, not an arrow, with
/// no track (11.17.2.2), and gone once the fix is older than three
/// seconds or worse than 30 m (11.17.2.3, 11.17.2.4's 30 m), never frozen.
///
/// Over the page, the runway proximity advisor (RunwayAdvisor): "On
/// runway 27", "Approaching runway 9-27" and the hold short line's
/// distance, said aloud as it changes; the diagram's hot spots ringed.
struct DiagramOwnShipView: View {
    @Environment(InFlight.self) private var inFlight
    @Environment(OwnShip.self) private var ownShip
    let place: AirportPlace
    let url: String
    @State private var advisor: RunwayAdvisor

    init(place: AirportPlace, url: String) {
        self.place = place
        self.url = url
        _advisor = State(initialValue: RunwayAdvisor(place: place))
    }

    private var ident: String { place.ident }
    @Environment(\.dismiss) private var dismiss
    @State private var diagram: DiagramPage?
    @State private var problem: String?
    @State private var handle = DiagramPDFHandle()
    /// White on Black and the Dimmer, as a chart's other pages (PageLook).
    private var pageLook = PageLookKept()
    /// The white disc behind the airplane, growing with its glyph's text size.
    @ScaledMetric(relativeTo: .title2) private var disc = 30.0

    var body: some View {
        NavigationStack {
            Group {
                if let diagram {
                    // Drawn again each second, so a fix that stops coming
                    // takes the airplane off rather than freezing it.
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        page(diagram, fix: drawn(inFlight.fix, now: context.date))
                    }
                } else if let problem {
                    ContentUnavailableView {
                        Label("Not shown", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(problem)
                    } actions: {
                        Button(Wording.tryAgain) { Task { await load() } }
                    }
                } else {
                    ProgressView("Fetching…")
                }
            }
            .navigationTitle("\(ident) Airport Diagram")
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { dismiss() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Toggle(isOn: $advisor.speaks) {
                        Label("Speak Runways", systemImage: advisor.speaks ? "speaker.wave.2.fill" : "speaker.slash")
                    }
                    .accessibilityIdentifier("diagram-speak")
                }
            }
            .safeAreaInset(edge: .top) {
                if diagram != nil, let lines = advisor.lines {
                    RunwayAdvisorLine(shown: lines.shown, detail: lines.detail, urgent: advisor.urgent)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let diagram {
                    Text(note(diagram))
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.xs)
                        .floatingGlass(in: Capsule())
                        .padding(.bottom, WingtipSpace.sm)
                }
            }
        }
        .task { await load() }
        .task { await advisor.watch({ inFlight.fix }, hotSpots: { diagram?.hotSpots ?? [] }) }
        // Every fix at its best while the diagram is up (OwnShip.diagramShown).
        .onAppear { ownShip.diagramShown = true }
        .onDisappear { ownShip.diagramShown = false }
    }

    /// The fix drawn: none where it is stale or coarse, or where the
    /// engine cannot say (the note says that, DiagramPage.usable).
    private func drawn(_ fix: OwnShip.Fix?, now: Date) -> OwnShip.Fix? {
        try? DiagramPage.usable(fix, now: now)
    }

    /// The line under the page: where the airplane is not drawn, why;
    /// and the planning aid's words with the FAA's credit.
    private func note(_ diagram: DiagramPage) -> String {
        let aid = "FAA · Planning aid, not for navigation"
        if let problem = advisor.problem { return "\(problem) \(aid)" }
        if let problem = diagram.problem { return "\(problem) \(aid)" }
        guard diagram.graticule != nil else { return "This diagram has no latitude and longitude marks to place the airplane by. \(aid)" }
        let usable = Result { try DiagramPage.usable(inFlight.fix, now: Date()) }
        if case .failure = usable { return "Your fix could not be checked for age and accuracy, so the airplane isn't drawn. \(aid)" }
        guard let fix = try? usable.get() else { return "Finding your position… \(aid)" }
        switch Result(catching: { try diagram.place(fix) }) {
        case .failure: return "Your position could not be placed on this diagram. \(aid)"
        case .success(let at): return at?.onPage == true ? aid : "You are off this diagram. \(aid)"
        }
    }

    private func page(_ diagram: DiagramPage, fix: OwnShip.Fix?) -> some View {
        DiagramPDFView(document: diagram.document, mark: mark(diagram, fix: fix), disc: disc, handle: handle,
                       hotSpots: diagram.hotSpots.map { diagram.pagePoint(x: $0.x, y: $0.y) }, look: night)
            // VoiceOver's three-finger zoom and Switch Control, which
            // cannot pinch: the page one element, where the airplane is
            // its value.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Airport diagram")
            .accessibilityValue([youAreHere(diagram, fix: fix), hotSpotWords(diagram)].compactMap { $0 }.joined(separator: ". "))
            .accessibilityAddTraits(.isImage)
            .accessibilityZoomAction { zoom in handle.zoom(in: zoom.direction == .zoomIn) }
            .accessibilityAction(named: "Fit the page") { handle.fit() }
    }

    /// The page's night look, a chart's own (PageLookKept).
    private var night: DiagramNight {
        let look = pageLook.look(chart: true)
        return DiagramNight(inverted: look.inverted, shade: look.shade)
    }

    /// Own ship on the page where the engine places it, turned by the
    /// page's north and the track; none off the page or unplaced.
    private func mark(_ diagram: DiagramPage, fix: OwnShip.Fix?) -> DiagramOwnShipMark? {
        guard let fix, let at = try? diagram.place(fix), at.onPage else { return nil }
        return DiagramOwnShipMark(at: diagram.pagePoint(x: at.x, y: at.y),
                                  turnDeg: (diagram.graticule?.northDeg ?? 0) + (fix.trackDeg ?? 0),
                                  tracking: fix.trackDeg != nil)
    }

    /// Where the airplane is on the page, as VoiceOver says it.
    private func youAreHere(_ diagram: DiagramPage, fix: OwnShip.Fix?) -> String {
        // Where the engine cannot place it, the note under the page says why.
        guard let fix, let at = try? diagram.place(fix), at.onPage else { return "You are not on this diagram" }
        return fix.trackDeg.map { "You are here, tracking \(Format.spokenHeadingTrue($0))" } ?? "You are here"
    }

    /// The hot spots ringed, as VoiceOver names them.
    private func hotSpotWords(_ diagram: DiagramPage) -> String? {
        diagram.hotSpots.isEmpty ? nil : "Hot spots ringed: \(diagram.hotSpots.map(\.name).joined(separator: ", "))"
    }

    private func load() async {
        problem = nil
        do {
            guard let address = URL(string: url) else { throw Planner.Failure(status: 404, detail: "No diagram for \(ident).") }
            let data: Data
            do {
                (data, _) = try await URLSession.shared.data(from: address)
                KeptForAir.writePicture(data, path: KeptForAir.pdfKey(url))
            } catch {
                // With no signal, the PDF Keep for the Air kept (or the last
                // one opened); the FAA's diagram changes only with the cycle.
                guard let kept = KeptForAir.picture(KeptForAir.pdfKey(url)) else { throw error }
                data = kept
            }
            guard let read = DiagramPage.read(data) else {
                problem = "The FAA's diagram for \(ident) could not be read."
                return
            }
            diagram = read
        } catch {
            problem = Problems.say("The FAA's diagram for \(ident) could not be fetched", error)
        }
    }
}

/// The advisor's words over the diagram: what it says, bold, and the
/// distance under it, on the floating glass the page's note has; in the
/// warning's colour on a runway or at its line.
struct RunwayAdvisorLine: View {
    let shown: String
    let detail: String?
    let urgent: Bool

    var body: some View {
        VStack(spacing: WingtipSpace.xxs) {
            Text(shown).font(.headline).foregroundStyle(urgent ? FindingStyle.colour("stop") : .primary)
            if let detail { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.card))
        .padding(.top, WingtipSpace.sm)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("runway-advisor")
    }
}
