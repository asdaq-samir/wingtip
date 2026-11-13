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

/// A picture to show full screen: what it is, how its pages are had,
/// and the credit its licence asks for.
struct ShownPicture: Identifiable {
    let id = UUID()
    let title: String
    var credit: String?
    /// The kept answer it is drawn from, for its age with no signal.
    var kept: (kind: KeptForAir.Kind, key: String)?
    /// An approach plate's page as the planner placed it, for own ship on
    /// its first page (PlatePosition); nil for every other picture.
    var georeference: APIPlateGeoreference?
    let load: () async throws -> [UIImage]

    /// The planner's pictures by their paths.
    static func paths(_ title: String, _ paths: [String], credit: String? = nil) -> ShownPicture {
        ShownPicture(title: title, credit: credit) { try await PictureCache.images(paths) }
    }

    /// One of the FAA's charts by its address, its pages drawn by the
    /// planner (/api/faa-chart): a plate, the diagram, the Chart
    /// Supplement's pages for the field.
    static func faaChart(_ title: String, url: String, airport: String) -> ShownPicture {
        ShownPicture(title: title, kept: (.plates, "\(airport)|\(url)")) {
            let pages = try await KeptForAir.answer(.plates, key: "\(airport)|\(url)") { try await Planner.faaChart(url: url, airport: airport) }.value
            guard !pages.isEmpty else { throw Planner.Failure(status: 404, detail: "The FAA's chart has no page for \(airport).") }
            return try await PictureCache.images(pages.map(\.path))
        }
    }
}

/// A chart or a photo full screen to pinch in on, as Files shows a page:
/// its title at the top and the close at the right, which goes back.
struct PictureViewer: View {
    @Environment(KeptShown.self) private var keptShown
    let picture: ShownPicture
    @Environment(\.dismiss) private var dismiss
    @State private var images: [UIImage]?
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Group {
                if let images {
                    Group {
                        if let georeference = picture.georeference {
                            PlatePictures(images: images, georeference: georeference)
                        } else {
                            ZoomablePictures(images: images)
                        }
                    }
                    .ignoresSafeArea(edges: .bottom)
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
            .navigationTitle(picture.title)
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { dismiss() }
            .safeAreaInset(edge: .top) {
                if let kept = picture.kept, images != nil, keptShown.at(kept.kind, key: kept.key) != nil {
                    KeptAgeLine(kind: kept.kind, key: kept.key)
                        .padding(.horizontal, WingtipSpace.sm).padding(.vertical, WingtipSpace.xs)
                        .floatingGlass(in: Capsule())
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let credit = picture.credit, images != nil {
                    Text(credit).font(.caption2).foregroundStyle(.secondary)
                        .padding(.horizontal, WingtipSpace.sm).padding(.vertical, WingtipSpace.xs)
                        .floatingGlass(in: Capsule())
                        .padding(.bottom, WingtipSpace.sm)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        problem = nil
        do { images = try await picture.load() } catch { problem = error.localizedDescription }
    }
}

/// A plate's pages with own ship on the first, where the engine places the
/// fix (PlatePosition), drawn again at each fix; none while own ship is off.
private struct PlatePictures: View {
    @Environment(InFlight.self) private var inFlight
    let images: [UIImage]
    let georeference: APIPlateGeoreference

    var body: some View {
        let mark = PlatePosition.mark(inFlight.fix, georeference: georeference)
        ZoomablePictures(images: images, mark: mark)
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

    func makeUIView(context: Context) -> PagesScrollView {
        let view = PagesScrollView()
        view.images = images
        view.mark = mark
        return view
    }

    func updateUIView(_ view: PagesScrollView, context: Context) {
        if !view.images.elementsEqual(images, by: ===) { view.images = images }
        if view.mark != mark { view.mark = mark }
    }
}

final class PagesScrollView: UIScrollView, UIScrollViewDelegate {
    private let container = UIView()
    private var laidWidth: CGFloat = 0
    /// The airplane on the first page, inside the zoomed content so it
    /// stays on its point through a pinch, a drag and a double tap, and
    /// scaled back each zoom so it keeps its size, as the map's mark does.
    private let ownShip = PageOwnShipView()
    static let gap: CGFloat = 8

    var images: [UIImage] = [] {
        didSet {
            container.subviews.forEach { $0.removeFromSuperview() }
            for image in images {
                let page = UIImageView(image: image)
                page.contentMode = .scaleAspectFit
                page.backgroundColor = .white
                container.addSubview(page)
            }
            laidWidth = 0
            setNeedsLayout()
        }
    }

    var mark: PageMark? {
        didSet { placeOwnShip() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = 8
        bouncesZoom = true
        showsHorizontalScrollIndicator = false
        backgroundColor = .systemBackground
        addSubview(container)
        let twice = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        twice.numberOfTapsRequired = 2
        addGestureRecognizer(twice)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// The pages the view's width, one under another, laid again when
    /// the width changes (a turn of the phone).
    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        if width > 0, width != laidWidth {
            laidWidth = width
            if zoomScale != 1 { zoomScale = 1 }
            var y: CGFloat = 0
            for case let page as UIImageView in container.subviews {
                let size = page.image?.size ?? .zero
                let height = size.width > 0 ? width * size.height / size.width : 0
                page.frame = CGRect(x: 0, y: y, width: width, height: height)
                y += height + Self.gap
            }
            container.frame = CGRect(x: 0, y: 0, width: width, height: max(0, y - Self.gap))
            contentSize = container.frame.size
            placeOwnShip()
        }
        centre()
    }

    /// The airplane at its fractions of the first page, turned to the
    /// track on the page; off the page, none.
    private func placeOwnShip() {
        guard let mark, let page = container.subviews.first(where: { $0 is UIImageView }) else {
            ownShip.removeFromSuperview()
            return
        }
        if ownShip.superview !== container { container.addSubview(ownShip) }
        container.bringSubviewToFront(ownShip)
        ownShip.center = CGPoint(x: page.frame.minX + page.frame.width * mark.x, y: page.frame.minY + page.frame.height * mark.y)
        ownShip.show(mark, zoom: zoomScale)
    }

    /// A page shorter than the screen sits in its middle, as Photos'.
    private func centre() {
        let spare = max(0, (bounds.height - safeAreaInsets.top - safeAreaInsets.bottom - contentSize.height) / 2)
        if contentInset.top != spare { contentInset = UIEdgeInsets(top: spare, left: 0, bottom: spare, right: 0) }
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { container }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centre()
        if let mark { ownShip.show(mark, zoom: zoomScale) }
    }

    @objc private func doubleTapped(_ tap: UITapGestureRecognizer) {
        // The zoom steps rather than glides with Reduce Motion on (MapMotion).
        if zoomScale > 1.01 {
            setZoomScale(1, animated: MapMotion.animated)
        } else {
            let at = tap.location(in: container)
            let size = CGSize(width: bounds.width / 3, height: bounds.height / 3)
            zoom(to: CGRect(x: at.x - size.width / 2, y: at.y - size.height / 2, width: size.width, height: size.height), animated: MapMotion.animated)
        }
    }
}

/// Own ship on a plate's page: the map's airplane (PlaneMarkView), a blue
/// arrow in a white disc turned to the track while flying, a dot where it
/// is still or has no track.
final class PageOwnShipView: UIView {
    private let arrow = UIImageView()
    static let side: CGFloat = 28

    override init(frame: CGRect) {
        super.init(frame: CGRect(x: 0, y: 0, width: Self.side, height: Self.side))
        arrow.frame = bounds.insetBy(dx: 3, dy: 3)
        arrow.contentMode = .scaleAspectFit
        arrow.tintColor = UIColor.systemBlue
        backgroundColor = NightPalette.markFill
        layer.cornerRadius = Self.side / 2
        layer.borderWidth = 1
        layer.borderColor = WingtipColor.Chart.shade.withAlphaComponent(0.4).cgColor
        addSubview(arrow)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Its glyph for the mark, kept its size at the page's zoom and
    /// turned to the track on the page.
    func show(_ mark: PageMark, zoom: CGFloat) {
        let turned = mark.moving && mark.rotationDeg != nil
        arrow.image = UIImage(systemName: turned ? "location.north.fill" : "circle.fill")
        let scale = zoom > 0 ? 1 / zoom : 1
        transform = CGAffineTransform(scaleX: scale, y: scale)
            .rotated(by: turned ? (mark.rotationDeg ?? 0) * .pi / 180 : 0)
    }
}

#Preview("PictureViewer") {
    // A picture drawn here, so the viewer shows a page without the planner.
    PictureViewer(picture: ShownPicture(title: "Airport diagram", credit: "FAA") {
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
