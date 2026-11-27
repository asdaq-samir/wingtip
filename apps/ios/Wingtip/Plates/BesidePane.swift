import SwiftUI
import UIKit

/// How much of the map's room the chart beside it takes: a menu of three,
/// not a drag (discrete settings are menus, CLAUDE.md), as Split View's own
/// thirds and halves are.
enum BesideShare: String, CaseIterable, Identifiable {
    case third, half, twoThirds

    var id: String { rawValue }

    var title: String {
        switch self {
        case .third: "A Third"
        case .half: "Half"
        case .twoThirds: "Two Thirds"
        }
    }

    var fraction: CGFloat {
        switch self {
        case .third: 1.0 / 3.0
        case .half: 0.5
        case .twoThirds: 2.0 / 3.0
        }
    }

    static let key = "besideShare"
}

/// The pane's model: the chart's pages, fetched once for the chart asked.
@MainActor
@Observable
final class BesideModel {
    private(set) var picture: ShownPicture?
    private(set) var images: [UIImage]?
    private(set) var problem: String?

    func load(_ request: PictureRequest) async {
        let picture = ShownPicture(request)
        self.picture = picture
        images = nil
        problem = nil
        do { images = try await picture.load() } catch { problem = error.localizedDescription }
    }
}

/// A chart in a column of its own beside the map on the iPad, the layout
/// iPad pilots fly an approach in (Garmin Pilot's and WingX's split
/// screen): the plate with own ship on its plan view where the planner
/// placed the page (PlatePosition, AC 120-76D's own ship as the viewer
/// draws it), pinched and panned as the viewer's pages are, and the
/// pilot's markup on it. The map stays live beside it, and cards still
/// open in the inspector. Its bar holds its share of the room, the chart
/// in a window of its own, and its close.
struct BesidePane: View {
    @Environment(Navigator.self) private var nav
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var windows
    let request: PictureRequest
    @AppStorage(BesideShare.key) private var share = BesideShare.half
    @State private var model = BesideModel()
    @State private var markup = MarkupState()
    /// A chart's pages at night as the plate on the map (PageLook).
    private var pageLook = PageLookKept()

    var body: some View {
        NavigationStack {
            Group {
                if let images = model.images {
                    if let georeference = request.georeference {
                        PlatePictures(images: images, georeference: georeference, markup: markup, look: pageLook.look(chart: true))
                    } else {
                        ZoomablePictures(images: images, markup: markup, look: pageLook.look(chart: request.isChart))
                    }
                } else if let problem = model.problem {
                    ContentUnavailableView {
                        Label("Not shown", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(problem)
                    } actions: {
                        Button("Try Again") { Task { await model.load(request) } }
                    }
                } else {
                    ProgressView("Fetching…")
                }
            }
            .navigationTitle(request.title)
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { nav.beside = nil }
            .toolbar { tools }
        }
        .onAppear { markup.key = request.markupKey }
        .task(id: request) { await model.load(request) }
        .accessibilityIdentifier("beside-pane")
    }

    @ToolbarContentBuilder
    private var tools: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            Menu {
                Picker("Width", selection: $share) {
                    ForEach(BesideShare.allCases) { Text($0.title).tag($0) }
                }
            } label: {
                Label("Width", systemImage: "rectangle.split.2x1")
            }
            .accessibilityIdentifier("beside-width")
            if model.images != nil {
                Toggle(isOn: $markup.on) { Label("Markup", systemImage: "pencil.tip.crop.circle") }
                    .accessibilityIdentifier("beside-markup")
            }
            if windows {
                Button("Open in New Window", systemImage: "macwindow.badge.plus") {
                    openWindow(id: PictureRequest.window, value: request)
                    nav.beside = nil
                }
            }
        }
    }
}

/// Beside the Map, on a chart's viewer and its row's menu in the iPad's
/// layout: the chart into the column beside the map (BesidePane), the
/// viewer over the app put away.
struct BesideMapButton: View {
    /// None in a chart's own window, which has no map beside it.
    @Environment(Navigator.self) private var nav: Navigator?
    @Environment(\.splitLayout) private var split
    let request: PictureRequest
    var then: () -> Void = {}

    var body: some View {
        if split, let nav {
            Button("Beside the Map", systemImage: "rectangle.righthalf.inset.filled") {
                nav.beside = request
                then()
            }
            .accessibilityIdentifier("picture-beside")
        }
    }
}
