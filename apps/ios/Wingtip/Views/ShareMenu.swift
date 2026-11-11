import SwiftUI
import UniformTypeIdentifiers

/// The route shared, as the web app's ShareMenu: its link, the nav log as
/// text and as the kneeboard's page (PDF), a GPX route for another app,
/// ForeFlight's own link (the checkpoints' pack first, then the route),
/// and Save as File: the flight as a Wingtip flight file (FlightFile),
/// which opens on another iPhone as the shared link's preview, and the
/// kneeboard as a PDF, each saved through the system's file exporter
/// (SaveFileExporter). The route card's ••• (RouteCard) is this menu with
/// its own rows round the sharing, which then sits in a Share submenu, so
/// the sheets it opens live in one place (`rows`, `more`, `label`).
struct ShareMenu<Rows: View, More: View, Shown: View>: View {
    @Environment(Plan.self) private var plan
    @Environment(\.openURL) private var openURL
    @State private var sharing: ShareItems?
    @State private var includeTail = false
    /// The file being saved, while the exporter is up.
    @State private var saving: SavedFile?

    /// The rows above the sharing and below it, and the menu's face;
    /// nested, the sharing is a Share submenu.
    let rows: Rows
    let more: More
    let label: Shown
    let nested: Bool

    init(rows: Rows, more: More, label: Shown, nested: Bool = true) {
        self.rows = rows
        self.more = more
        self.label = label
        self.nested = nested
    }

    struct ShareItems: Identifiable {
        let id = UUID()
        let items: [Any]
    }

    var body: some View {
        Menu {
            if nested {
                rows
                Menu { ways } label: { Label("Share", systemImage: WingtipIcon.share) }
                    .disabled(plan.legs.isEmpty)
                more
            } else {
                ways
            }
        } label: {
            label
        }
        .accessibilityLabel(nested ? "More" : "Share")
        .disabled(!nested && plan.legs.isEmpty)
        .sheet(item: $sharing) { share in ActivityView(items: share.items).presentationDetents([.medium, .large]) }
        .modifier(SaveFileExporter(saving: $saving) { url in sharing = ShareItems(items: [url]) })
    }

    /// The ways the route goes out.
    @ViewBuilder private var ways: some View {
        ShareLink(item: RouteShare.link(plan, includeTail: includeTail)) { Label("Share Link", systemImage: "link") }
        if let tail = plan.tail { Toggle("Include \(tail)", isOn: $includeTail) }
        ShareLink(item: RouteShare.navLogText(plan)) { Label("Nav Log as Text", systemImage: WingtipIcon.navLog) }
        Button { pdf() } label: { Label("Nav Log as PDF", systemImage: "doc.richtext") }
        Menu {
            Button { saveFlight() } label: { Label("Flight", systemImage: "airplane") }
            Button { saveKneeboard() } label: { Label("Kneeboard as PDF", systemImage: "doc.richtext") }
        } label: {
            Label("Save as File", systemImage: "square.and.arrow.down")
        }
        // ForeFlight sends the route on to the panel wirelessly (Garmin's
        // Connext, Avidyne, Dynon): the owner's pick (2026-11-02), as most
        // pilots have ForeFlight and not Garmin Pilot.
        Button { foreflight() } label: { Label("Open in ForeFlight", systemImage: WingtipIcon.send) }
    }

    /// The flight as a Wingtip flight file, the N-number in it only where
    /// Include is on, as for Share Link.
    private func saveFlight() {
        guard let data = try? FlightFile.of(plan, includeTail: includeTail).data() else { return }
        saving = SavedFile(data: data, type: .wingtipFlight, name: FlightFile.name(plan))
    }

    /// The kneeboard's page as a PDF file (Kneeboard.pdf).
    private func saveKneeboard() {
        guard let url = Kneeboard.pdf(plan), let data = try? Data(contentsOf: url) else { return }
        saving = SavedFile(data: data, type: .pdf, name: url.lastPathComponent)
    }

    private func pdf() {
        guard let url = Kneeboard.pdf(plan) else { return }
        sharing = ShareItems(items: [url])
    }

    /// ForeFlight takes no route and pack in one: the pack the first time a
    /// route goes there from this device, then the route itself, its
    /// checkpoints by their names in the pack.
    private func foreflight() {
        let route = plan.idents.joined(separator: "-")
        let names = plan.checkpoints.map { $0.waypoint ?? "" }
        let sent = RouteShare.packSent(route, names: names)
        if !sent, !plan.checkpoints.isEmpty {
            RouteShare.markPackSent(route, names: names)
            openURL(RouteShare.openPack(RouteShare.packURL(plan)))
        } else {
            openURL(RouteShare.foreflightRoute(plan, named: sent))
        }
    }
}

extension ShareMenu where Rows == EmptyView, More == EmptyView, Shown == AnyView {
    /// The route's Share alone, its glyph the face (the nav log's bar, the strip).
    init() {
        self.init(rows: EmptyView(), more: EmptyView(),
                  label: AnyView(Image(systemName: WingtipIcon.share)), nested: false)
    }
}
