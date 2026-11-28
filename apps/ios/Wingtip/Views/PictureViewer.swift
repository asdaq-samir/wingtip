import Nuke
import NukeUI
import SwiftUI
import UIKit

/// The planner's pictures, through Nuke's pipeline: decoded off the main
/// thread, kept in its memory cache for the session (a card opened again,
/// or the full-screen view of a thumbnail, does not ask a second time) and
/// on disk in the gateway's URLCache as the planner's Cache-Control says,
/// each asked by KeptPictureLoader.
enum PictureCache {
    static let pipeline = ImagePipeline {
        $0.dataLoader = KeptPictureLoader()
    }

    /// A picture by the planner's path for it (Planner.address(of:)).
    static func image(_ path: String) async throws -> UIImage {
        do {
            return try await pipeline.image(for: Planner.address(of: path))
        } catch {
            throw error.cause
        }
    }

    /// A picture's bytes as sent: what Keep for the Air keeps.
    static func data(_ path: String) async throws -> Data {
        do {
            return try await pipeline.data(for: ImageRequest(url: Planner.address(of: path))).0
        } catch {
            throw error.cause
        }
    }

    /// Several, in their order: a chart's few pages one after another.
    static func images(_ paths: [String]) async throws -> [UIImage] {
        var found: [UIImage] = []
        for path in paths { found.append(try await image(path)) }
        return found
    }
}

extension ImagePipeline.Error {
    /// The loader's own error (the planner's refusal, no connection), or
    /// the picture could not be read.
    var cause: any Error {
        if case .dataLoadingFailed(let error) = self { return error }
        return Planner.Failure(status: 200, detail: "The picture could not be read.")
    }
}

/// Nuke's loader of the planner's pictures: through the gateway's session,
/// so with the pilot's cookie and its cache, refused in the planner's own
/// words; and with no signal, the picture Keep for the Air kept (a plate's
/// page, a diagram), as its own answer.
final class KeptPictureLoader: DataLoading {
    func loadData(with request: URLRequest, didReceiveData: @escaping @Sendable (Data, URLResponse) -> Void,
                  completion: @escaping @Sendable ((any Error)?) -> Void) -> any Cancellable {
        var request = request
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        let asked = request
        return Loading(task: Task {
            do {
                let (data, response) = try await Gateway.session.data(for: asked)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status) else {
                    Log.planner.error("\(asked.url?.path ?? "", privacy: .public) answered \(status)")
                    throw Planner.Failure(status: status, detail: Planner.detail(of: data))
                }
                didReceiveData(data, response)
                completion(nil)
            } catch {
                guard KeptForAir.fallsBack(error), let url = asked.url, let kept = KeptForAir.picture(url.absoluteString) else {
                    completion(error)
                    return
                }
                didReceiveData(kept, URLResponse(url: url, mimeType: nil, expectedContentLength: kept.count, textEncodingName: nil))
                completion(nil)
            }
        })
    }

    private struct Loading: Cancellable {
        let task: Task<Void, Never>
        func cancel() { task.cancel() }
    }
}

/// A picture of the planner's in a box, filled, a placeholder while it
/// comes and a glyph where it could not be had: Nuke's LazyImage.
struct RemotePicture: View {
    let path: String
    var fit = false

    var body: some View {
        LazyImage(url: Planner.address(of: path)) { state in
            if let image = state.image {
                if fit {
                    image.resizable().scaledToFit()
                } else {
                    image.resizable().scaledToFill()
                }
            } else if state.error != nil {
                Image(systemName: "photo").font(.title2).foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .pipeline(PictureCache.pipeline)
    }
}

/// A chart or a photo full screen to pinch in on, as Files shows a page:
/// its title at the top and the close at the right, which goes back.
struct PictureViewer: View {
    @Environment(KeptShown.self) private var keptShown
    let picture: ShownPicture
    /// In a window of its own (PictureWindow), which its close shuts,
    /// rather than over the app.
    var inWindow = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dismissWindow) private var dismissWindow
    @State private var images: [UIImage]?
    @State private var problem: String?
    /// The pilot's own marks on, the tool picker up (PlateMarkup).
    @State private var markup = MarkupState()
    /// A chart's pages at night as the plate on the map (PageLook).
    private var pageLook = PageLookKept()

    var body: some View {
        NavigationStack {
            Group {
                if let images {
                    Group {
                        if let georeference = picture.georeference {
                            PlatePictures(images: images, georeference: georeference, markup: markup, look: pageLook.look(chart: true))
                        } else {
                            ZoomablePictures(images: images, markup: markup, look: pageLook.look(chart: picture.isChart))
                        }
                    }
                    .ignoresSafeArea(edges: .bottom)
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
            .navigationTitle(picture.title)
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { if inWindow { dismissWindow() } else { dismiss() } }
            // Markup and a window of its own, at the bar's left (PictureTools).
            .modifier(PictureTools(picture: picture, inWindow: inWindow, shown: images != nil, markup: $markup) { dismiss() })
            .safeAreaInset(edge: .top) {
                if let kept = picture.kept, images != nil, keptShown.at(kept.kind, key: kept.key) != nil {
                    KeptAgeLine(kind: kept.kind, key: kept.key)
                        .padding(.horizontal, WingtipSpace.sm).padding(.vertical, WingtipSpace.xs)
                        .floatingGlass(in: Capsule())
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let credit = picture.credit, images != nil {
                    Group {
                        if let page = picture.creditLink { Link(credit, destination: page) } else { Text(credit).foregroundStyle(.secondary) }
                    }
                    .font(.caption2).padding(.horizontal, WingtipSpace.sm).padding(.vertical, WingtipSpace.xs)
                    .floatingGlass(in: Capsule())
                    .padding(.bottom, WingtipSpace.sm)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        problem = nil
        do { images = try await picture.load() } catch { problem = Problems.say("The picture could not be fetched", error) }
    }
}

/// A plate's pages with own ship on the first, where the engine places the
/// fix (PlatePosition), drawn again at each fix; none while own ship is off.
struct PlatePictures: View {
    @Environment(InFlight.self) private var inFlight
    let images: [UIImage]
    let georeference: APIPlateGeoreference
    let markup: MarkupState
    var look = PageLook()

    var body: some View {
        let mark = PlatePosition.mark(inFlight.fix, georeference: georeference)
        ZoomablePictures(images: images, mark: mark, markup: markup, look: look)
            .accessibilityValue(mark == nil ? "" : "You are here")
    }
}

/// The pages one under another in a scroll view that pinches and
/// double-taps to zoom, as UIKit's own does it best. Pictures, not PDFKit:
/// the planner sends the FAA's charts as its drawings of their pages
/// (/api/faa-chart/page/…png, a region's booklet cut to the field's pages)
/// and the photos as pictures, and serves no PDF to draw as vectors; the
/// airport diagram with own ship, fetched as the FAA's PDF, is PDFKit's
/// (DiagramPDFView).
struct ZoomablePictures: UIViewRepresentable {
    let images: [UIImage]
    /// Own ship on the first page (a plate's), or nil.
    var mark: PageMark?
    /// The pilot's marks over the pages (PlateMarkup).
    var markup = MarkupState()
    /// A chart's night look (PageLook); a photo's none.
    var look = PageLook()

    func makeUIView(context: Context) -> PagesScrollView {
        let view = PagesScrollView()
        view.images = images
        view.mark = mark
        updateUIView(view, context: context)
        return view
    }

    func updateUIView(_ view: PagesScrollView, context: Context) {
        if !view.images.elementsEqual(images, by: ===) { view.images = images }
        if view.mark != mark { view.mark = mark }
        if view.look != look { view.look = look }
        view.markup.key = markup.key
        view.markup.on = markup.on
        if view.cleared != markup.clears {
            view.cleared = markup.clears
            view.markup.clear()
        }
    }
}

#Preview("PictureViewer") {
    // A picture drawn here, so the viewer shows a page without the planner.
    PictureViewer(picture: ShownPicture(title: "Airport Diagram", credit: "FAA") {
        [UIGraphicsImageRenderer(size: CGSize(width: 600, height: 800)).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 600, height: 800))
            UIColor.darkGray.setFill()
            context.fill(CGRect(x: 120, y: 80, width: 60, height: 640))
        }]
    })
}

#Preview("ZoomablePictures") {
    ZoomablePictures(images: [UIImage(systemName: "airplane") ?? UIImage()])
}
