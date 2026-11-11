import PDFKit
import SwiftUI

/// The FAA's airport diagram with the airplane on it (#218): the d-TPP's
/// PDF drawn on the phone, and own ship placed by the diagram's own
/// latitude and longitude labels (the engine's diagram_labels,
/// diagram_graticule and diagram_point; the free d-TPP's diagrams carry
/// no GeoPDF georeference). PDFKit reads the page's text and where each
/// label is drawn; the engine does the rest. A diagram with no labels
/// (KORD's) is shown without the airplane, and says so.
///
/// For a pilot's awareness on the ground, not for navigation: the signs,
/// the markings and ATC's taxi instructions are what count (AC 120-74B;
/// AC 120-76D 11.17.1, "use of external visual references is sufficient
/// for maneuvering" on the ground), and the sheet says it is a planning
/// aid. Own ship follows AC 120-76D 11.17.2: a circle, not an arrow, with
/// no track (11.17.2.2), and gone once the fix is older than three
/// seconds or worse than 30 m (11.17.2.3, 11.17.2.4's 30 m), never frozen.
struct DiagramOwnShipView: View {
    let ident: String
    let url: String
    @Environment(\.dismiss) private var dismiss
    @State private var diagram: DiagramPage?
    @State private var problem: String?
    @State private var scale: CGFloat = 1
    @State private var settledScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var settledOffset: CGSize = .zero
    /// The white disc behind the airplane, growing with its glyph's text size.
    @ScaledMetric(relativeTo: .title2) private var disc = 30.0

    var body: some View {
        NavigationStack {
            Group {
                if let diagram {
                    // Drawn again each second, so a fix that stops coming
                    // takes the airplane off rather than freezing it.
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        page(diagram, fix: drawn(InFlight.shared.fix, now: context.date))
                    }
                } else if let problem {
                    ContentUnavailableView {
                        Label("Not shown", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(problem)
                    } actions: {
                        Button("Try Again") { Task { await load() } }
                    }
                } else {
                    ProgressView("Fetching…")
                }
            }
            .navigationTitle("\(ident) airport diagram")
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { dismiss() }
            .safeAreaInset(edge: .bottom) {
                if let diagram {
                    Text(note(diagram))
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.xs)
                        .floatingGlass(in: Capsule(), material: .thinMaterial)
                        .padding(.bottom, WingtipSpace.sm)
                }
            }
        }
        .task { await load() }
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
        if let problem = diagram.problem { return "\(problem) \(aid)" }
        guard diagram.graticule != nil else { return "This diagram has no latitude and longitude marks to place the airplane by. \(aid)" }
        let usable = Result { try DiagramPage.usable(InFlight.shared.fix, now: Date()) }
        if case .failure = usable { return "Your fix couldn't be checked for age and accuracy, so the airplane isn't drawn. \(aid)" }
        guard let fix = try? usable.get() else { return "Finding your position… \(aid)" }
        switch Result(catching: { try diagram.place(fix) }) {
        case .failure: return "Your position couldn't be placed on this diagram. \(aid)"
        case .success(let at): return at?.onPage == true ? aid : "You are off this diagram. \(aid)"
        }
    }

    private func page(_ diagram: DiagramPage, fix: OwnShip.Fix?) -> some View {
        GeometryReader { geo in
            let fitted = Self.fitted(diagram.size, in: geo.size)
            ZStack(alignment: .topLeading) {
                Image(uiImage: diagram.image)
                    .resizable()
                    .frame(width: fitted.width, height: fitted.height)
                if let fix, let at = try? diagram.place(fix), at.onPage {
                    let k = fitted.width / diagram.size.width
                    Image(systemName: fix.trackDeg == nil ? "circle.fill" : "location.north.fill")
                        .font(WingtipType.card)
                        .foregroundStyle(Color(uiColor: WingtipColor.Chart.mapBlue))
                        .background(Circle().fill(.white).frame(width: disc, height: disc))
                        .rotationEffect(.degrees((diagram.graticule?.northDeg ?? 0) + (fix.trackDeg ?? 0)))
                        .position(x: at.x * k, y: at.y * k)
                        .accessibilityLabel(fix.trackDeg.map { "You are here, tracking \(SpokenFigures.degrees($0)) true" } ?? "You are here")
                }
            }
            .frame(width: fitted.width, height: fitted.height)
            .scaleEffect(scale)
            .offset(offset)
            .frame(width: geo.size.width, height: geo.size.height)
            .contentShape(Rectangle())
            // A pinch and a drag to read it close, as any picture.
            .gesture(
                MagnifyGesture()
                    .onChanged { scale = max(1, min(8, settledScale * $0.magnification)) }
                    .onEnded { _ in settledScale = scale }
                    .simultaneously(with: DragGesture()
                        .onChanged { offset = CGSize(width: settledOffset.width + $0.translation.width, height: settledOffset.height + $0.translation.height) }
                        .onEnded { _ in settledOffset = offset }))
            .onTapGesture(count: 2) {
                scale = 1; settledScale = 1; offset = .zero; settledOffset = .zero
            }
            // The pinch and the double tap for VoiceOver's three-finger
            // zoom and Switch Control, which cannot pinch or drag: the
            // page one element, where the airplane is its value.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Airport diagram")
            .accessibilityValue(youAreHere(diagram, fix: fix))
            .accessibilityAddTraits(.isImage)
            .accessibilityZoomAction { zoom in
                scale = max(1, min(8, scale * (zoom.direction == .zoomIn ? 1.5 : 1 / 1.5)))
                settledScale = scale
                if scale == 1 { offset = .zero; settledOffset = .zero }
            }
            .accessibilityAction(named: "Fit the page") {
                scale = 1; settledScale = 1; offset = .zero; settledOffset = .zero
            }
        }
        .background(Color.white)
    }

    /// Where the airplane is on the page, as VoiceOver says it.
    private func youAreHere(_ diagram: DiagramPage, fix: OwnShip.Fix?) -> String {
        // Where the engine cannot place it, the note under the page says why.
        guard let fix, let at = try? diagram.place(fix), at.onPage else { return "You are not on this diagram" }
        return fix.trackDeg.map { "You are here, tracking \(Format.spokenHeadingTrue($0))" } ?? "You are here"
    }

    /// The page's size fitted into the room, its shape kept.
    static func fitted(_ page: CGSize, in room: CGSize) -> CGSize {
        guard page.width > 0, page.height > 0 else { return .zero }
        let k = min(room.width / page.width, room.height / page.height)
        return CGSize(width: page.width * k, height: page.height * k)
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
            problem = "The FAA's diagram for \(ident) could not be fetched. \(error.localizedDescription)"
        }
    }
}
