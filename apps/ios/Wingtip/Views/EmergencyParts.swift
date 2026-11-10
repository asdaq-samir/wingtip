import MapKit
import SwiftUI

/// The emergency view's map, its top third (docs/design/ios.md §8): the
/// airplane, the engine's glide reach (best_fields' ring, wind
/// corrected) and the line to the field picked in color.chart.emergency.
/// Apple's map under it, not the chart: what matters here is the line and
/// the ring, on a map that is up at once. It follows the airplane without
/// animation, the pilot's eyes elsewhere.
struct EmergencyMap: View {
    let fix: OwnShip.Fix?
    let picked: Emergency.Field?
    /// The glide's reach, [lat, lon] every 10 degrees; empty with none.
    let ring: [[Double]]

    private var line: Color { Color(uiColor: WingtipColor.Chart.emergency) }

    var body: some View {
        Map(position: .constant(position), interactionModes: [.zoom, .pan]) {
            if ring.count > 2 {
                MapPolygon(coordinates: ring.compactMap(Self.point))
                    .foregroundStyle(line.opacity(0.08))
                    .stroke(line.opacity(0.6), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            }
            if let fix, let picked {
                MapPolyline(coordinates: [fix.coordinate, CLLocationCoordinate2D(latitude: picked.lat, longitude: picked.lon)])
                    .stroke(line, lineWidth: 4)
                Marker(picked.ident, systemImage: "airplane.arrival", coordinate: CLLocationCoordinate2D(latitude: picked.lat, longitude: picked.lon))
                    .tint(line)
            }
            if let fix {
                Annotation("Your airplane", coordinate: fix.coordinate) {
                    Image(systemName: WingtipIcon.airplane)
                        .rotationEffect(.degrees(fix.trackDeg ?? 0))
                        .foregroundStyle(Color(uiColor: WingtipColor.Chart.mapBlue))
                        .accessibilityHidden(true)
                }
            }
        }
        .mapControlVisibility(.hidden)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(picked.map { "Map: the line to \($0.ident) and the glide's reach" } ?? "Map: the glide's reach")
    }

    /// Framed on the ring where the engine gave one, else round the
    /// airplane and the field picked.
    private var position: MapCameraPosition {
        let points = ring.compactMap(Self.point) + [fix?.coordinate].compactMap { $0 }
            + [picked.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }].compactMap { $0 }
        guard !points.isEmpty else { return .automatic }
        let rect = points.map { MKMapRect(origin: MKMapPoint($0), size: MKMapSize(width: 1, height: 1)) }.reduce(MKMapRect.null) { $0.union($1) }
        return .rect(rect.insetBy(dx: -rect.size.width * 0.15 - 2_000, dy: -rect.size.height * 0.15 - 2_000))
    }

    static func point(_ pair: [Double]) -> CLLocationCoordinate2D? {
        pair.count == 2 ? CLLocationCoordinate2D(latitude: pair[0], longitude: pair[1]) : nil
    }
}

/// Squawk 7700 and Guard as two large figure tiles (AIM 6-2-2, 6-3-1(d)),
/// the engine's mayday_call's own figures: each copies on a tap, and
/// VoiceOver says it in full. Side by side, stacked at the accessibility
/// sizes so neither figure is cut.
struct EmergencyCodeTiles: View {
    let call: Emergency.Mayday
    @Environment(\.dynamicTypeSize) private var size

    /// The guard frequency, as the engine labels it.
    private var guardChannel: EngineContract.MaydayCallAnswerChannelsItem? {
        call.channels.first { $0.label == "Guard" && $0.mhz != nil }
    }

    var body: some View {
        Section {
            let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: WingtipSpace.sm)) : AnyLayout(HStackLayout(spacing: WingtipSpace.sm))
            layout {
                tile("Squawk", call.squawk, spoken: "Squawk \(SpokenFigures.digits(call.squawk))")
                if let mhz = guardChannel?.mhz {
                    let figure = Format.number(mhz, decimals: 1)
                    tile("Guard", figure, spoken: "Guard, \(SpokenFigures.frequency(mhz))")
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private func tile(_ label: String, _ figure: String, spoken: String) -> some View {
        Button { FrequencyCopy.copy(figure) } label: {
            VStack(spacing: WingtipSpace.xxs) {
                Text(label).font(.headline).foregroundStyle(.secondary)
                Text(figure).figureFont().foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity, minHeight: 88)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(spoken)
        .accessibilityHint("Copies it")
    }
}
