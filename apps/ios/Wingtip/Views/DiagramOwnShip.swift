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
/// the markings and ATC's taxi instructions are what count (AC 120-74B),
/// and the sheet says it is a planning aid.
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

    var body: some View {
        NavigationStack {
            Group {
                if let diagram {
                    page(diagram)
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let diagram {
                    Text(note(diagram))
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(.thinMaterial, in: Capsule())
                        .padding(.bottom, 8)
                }
            }
        }
        .task { await load() }
    }

    /// The line under the page: where the airplane is not drawn, why;
    /// and the planning aid's words with the FAA's credit.
    private func note(_ diagram: DiagramPage) -> String {
        let aid = "FAA · Planning aid, not for navigation"
        guard diagram.graticule != nil else { return "This diagram has no latitude and longitude marks to place the airplane by. \(aid)" }
        guard let fix = InFlight.shared.fix else { return "Finding your position… \(aid)" }
        guard let at = diagram.place(fix), at.onPage else { return "You are off this diagram. \(aid)" }
        return aid
    }

    private func page(_ diagram: DiagramPage) -> some View {
        GeometryReader { geo in
            let fitted = Self.fitted(diagram.size, in: geo.size)
            ZStack(alignment: .topLeading) {
                Image(uiImage: diagram.image)
                    .resizable()
                    .frame(width: fitted.width, height: fitted.height)
                if let fix = InFlight.shared.fix, let at = diagram.place(fix), at.onPage {
                    let k = fitted.width / diagram.size.width
                    Image(systemName: "location.north.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.blue)
                        .background(Circle().fill(.white).frame(width: 30, height: 30))
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
                        .onEnded { _ in settledOffset = offset })
            )
            .onTapGesture(count: 2) {
                scale = 1; settledScale = 1; offset = .zero; settledOffset = .zero
            }
        }
        .background(Color.white)
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
            let (data, _) = try await URLSession.shared.data(from: address)
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

/// A diagram's first page as a picture, with its graticule from its labels
/// (nil where it has none the engine can fit).
struct DiagramPage {
    struct Graticule: Decodable, Equatable {
        let latOnX: Bool
        let a, b, c, d: Double
        let northDeg: Double
    }

    struct Placed: Decodable, Equatable {
        let x, y: Double
        let onPage: Bool
    }

    let image: UIImage
    /// The page in points.
    let size: CGSize
    let graticule: Graticule?

    /// Where the fix is on the page, in points from its top left.
    func place(_ fix: OwnShip.Fix) -> Placed? {
        guard let g = graticule else { return nil }
        return try? Engine.call("diagram_point", json: [
            "graticule": ["lat_on_x": g.latOnX, "a": g.a, "b": g.b, "c": g.c, "d": g.d, "north_deg": g.northDeg] as [String: Any],
            "lat": fix.coordinate.latitude, "lon": fix.coordinate.longitude,
            "width": Double(size.width), "height": Double(size.height),
        ], decoder: Planner.snakeCase)
    }

    /// The PDF's first page drawn three times its size, and its labels
    /// found: their words by the engine (diagram_labels), where each is
    /// drawn by PDFKit, the fit by the engine (diagram_graticule).
    static func read(_ data: Data) -> DiagramPage? {
        guard let document = PDFDocument(data: data), let page = document.page(at: 0) else { return nil }
        let box = page.bounds(for: .mediaBox)
        let image = page.thumbnail(of: CGSize(width: box.width * 3, height: box.height * 3), for: .mediaBox)
        // A page turned by its /Rotate would need its labels turned too:
        // the d-TPP's are all upright (0), and another is drawn without
        // the airplane.
        guard page.rotation == 0, let text = page.string else { return DiagramPage(image: image, size: box.size, graticule: nil) }
        let words: [String] = (try? Engine.call("diagram_labels", json: ["text": text])) ?? []
        var placed: [[String: Any]] = []
        for word in words {
            for found in document.findString(word, withOptions: .literal) where found.pages.first == page {
                let at = found.bounds(for: page)
                // PDFKit's points are from the page's foot; the engine's
                // from its top left.
                placed.append(["text": word, "x": Double(at.midX - box.minX), "y": Double(box.maxY - at.midY)])
            }
        }
        let graticule: Graticule? = try? Engine.call("diagram_graticule", json: ["labels": placed], decoder: Planner.snakeCase)
        return DiagramPage(image: image, size: box.size, graticule: graticule)
    }
}
