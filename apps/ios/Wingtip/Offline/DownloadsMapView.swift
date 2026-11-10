import MapKit
import SwiftUI

/// Downloads → Pick on the Map: the sectional sheets' coverage drawn on
/// the map, a sheet picked by a tap (the smallest under the finger, as
/// sheets overlap at their edges), or the map's view taken as a box of
/// its own; the pick and its size at the foot, with Download.
struct DownloadsMapView: View {
    let model: DownloadsModel
    @State private var picked: APIOfflineRegion?
    @State private var view: MKCoordinateRegion?
    @State private var asking = false

    private var sheets: [APIOfflineRegion] { model.regions.filter { $0.group == "sheet" } }

    var body: some View {
        MapReader { proxy in
            Map(initialPosition: .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 39.5, longitude: -98.35),
                                                            span: MKCoordinateSpan(latitudeDelta: 30, longitudeDelta: 50)))) {
                ForEach(sheets, id: \.id) { sheet in
                    ForEach(Array(sheet.boxes.enumerated()), id: \.offset) { _, box in
                        MapPolygon(coordinates: Self.corners(box))
                            .foregroundStyle(Color.accentColor.opacity(sheet.id == picked?.id ? 0.25 : 0.04))
                            .stroke(Color.accentColor, lineWidth: sheet.id == picked?.id ? 2 : 0.5)
                    }
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .onMapCameraChange(frequency: .onEnd) { view = $0.region }
            .onTapGesture { point in
                guard let at = proxy.convert(point, from: .local) else { return }
                picked = Self.sheet(at: at, in: sheets)
            }
        }
        .safeAreaInset(edge: .bottom) { foot }
        .navigationTitle("Pick on the Map")
        .navigationBarTitleDisplayMode(.inline)
        .task { if model.catalog == nil { await model.load() } }
    }

    private var foot: some View {
        VStack(spacing: WingtipSpace.sm) {
            if let picked {
                LabeledContent(picked.name, value: DownloadsView.size(model.size(of: picked)))
                Button("Download \(picked.name)") { asking = true }
                    .glassProminentButton()
                    .disabled(model.archives.isEmpty || model.busy.contains(picked.id))
            } else {
                Text("Tap a sheet, or download the map's view.").foregroundStyle(.secondary)
            }
            Button("Download This View") { Task { await downloadView() } }
                .glassButton()
                .disabled(view == nil || model.archives.isEmpty)
            ProblemLine(model.problem)
        }
        .padding()
        // Over the chart, not a scroller: the system's material behind it.
        .background(.regularMaterial)
        .confirmationDialog(picked.map { "Download \($0.name)?" } ?? "", isPresented: $asking, titleVisibility: .visible) {
            if let picked {
                Button("Download \(DownloadsView.size(model.size(of: picked)))") { Task { await model.download(picked.id) } }
            }
        }
    }

    /// The view as a box (the planner snaps it out to the half degree and
    /// turns away one wider than a state), its files listed and kept.
    private func downloadView() async {
        guard let view else { return }
        let c = view.center, s = view.span
        guard let id = await model.boxID(west: c.longitude - s.longitudeDelta / 2, south: c.latitude - s.latitudeDelta / 2,
                                         east: c.longitude + s.longitudeDelta / 2, north: c.latitude + s.latitudeDelta / 2) else { return }
        await model.download(id)
    }

    nonisolated static func corners(_ box: [Double]) -> [CLLocationCoordinate2D] {
        guard box.count == 4 else { return [] }
        return [CLLocationCoordinate2D(latitude: box[1], longitude: box[0]), CLLocationCoordinate2D(latitude: box[3], longitude: box[0]),
                CLLocationCoordinate2D(latitude: box[3], longitude: box[2]), CLLocationCoordinate2D(latitude: box[1], longitude: box[2])]
    }

    /// The smallest sheet whose box holds the point.
    nonisolated static func sheet(at point: CLLocationCoordinate2D, in sheets: [APIOfflineRegion]) -> APIOfflineRegion? {
        func area(_ b: [Double]) -> Double { (b[2] - b[0]) * (b[3] - b[1]) }
        let holding = sheets.compactMap { sheet -> (APIOfflineRegion, Double)? in
            guard let box = sheet.boxes.first(where: { $0.count == 4 && point.longitude >= $0[0] && point.longitude <= $0[2]
                    && point.latitude >= $0[1] && point.latitude <= $0[3]
            }) else { return nil }
            return (sheet, area(box))
        }
        return holding.min { $0.1 < $1.1 }?.0
    }
}
