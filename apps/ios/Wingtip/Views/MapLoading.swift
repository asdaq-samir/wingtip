import CoreLocation
import SwiftUI

/// Wingtip Maps' mark turning in the middle of the map while it loads, as
/// the web app's MapLoading (the owner, 2026-11-07): the dashed airspace
/// ring of the app's icon goes round the airplane, which holds still. It
/// sits in the middle of what the sheet leaves, where the map opens on the
/// pilot's last position (MapOpening), over the map until the chart and
/// its overlays are in, and fades as the map shows. With Reduce Motion on
/// the mark stands still.
struct MapLoading: View {
    /// The height the sheet covers at the foot of the map.
    let bottom: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var turning = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color(uiColor: .systemBackground)
                WingtipMark(angle: turning && !reduceMotion ? 360 : 0)
                    .frame(width: 56, height: 56)
                    .position(x: proxy.size.width / 2,
                              y: MapOpening.middle(height: proxy.size.height, top: proxy.safeAreaInsets.top, bottomInset: bottom))
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityElement()
        .accessibilityLabel("Loading the map")
        .accessibilityAddTraits(.updatesFrequently)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) { turning = true }
        }
    }
}

/// The app's icon (apps/web/public/favicon.svg, the web's MapLoading): a
/// dashed ring in the airspace magenta, #A3266F by day and #E37BB5 in dark
/// appearance, round the airplane in navy #14284B, white in dark. The
/// ring turns by `angle`; the airplane does not.
struct WingtipMark: View {
    var angle: Double = 0
    private static let ring = Color(UIColor(light: WingtipColor.Brand.markRing, dark: WingtipColor.Brand.markRingNight))
    private static let plane = Color(UIColor(light: WingtipColor.Brand.markPlane, dark: .white))

    var body: some View {
        GeometryReader { proxy in
            // The icon's 32-unit box drawn at the view's size.
            let k = min(proxy.size.width, proxy.size.height) / 32
            ZStack {
                Circle()
                    .stroke(Self.ring, style: StrokeStyle(lineWidth: 2 * k, dash: [7 * k, 3.2 * k]))
                    .frame(width: 26 * k, height: 26 * k)
                    .rotationEffect(.degrees(-112.5 + angle))
                Airplane()
                    .fill(Self.plane)
                    .overlay(Airplane().stroke(Self.plane, style: StrokeStyle(lineWidth: 3.5 * 0.36 * k, lineJoin: .round)))
                    .frame(width: 64 * 0.36 * k, height: 63 * 0.36 * k)
                    .offset(y: 0.3 * k)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .accessibilityHidden(true)
    }

    /// The icon's airplane in its own 64 by 63 box: the fuselage, the
    /// wing and the tail.
    struct Airplane: Shape {
        func path(in rect: CGRect) -> Path {
            let k = min(rect.width / 64, rect.height / 63)
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
            var path = Path()
            path.move(to: p(32, 12))
            path.addCurve(to: p(35, 18), control1: p(34.2, 12), control2: p(35, 14.5))
            path.addLine(to: p(34.2, 44))
            path.addLine(to: p(33, 51))
            path.addLine(to: p(31, 51))
            path.addLine(to: p(29.8, 44))
            path.addLine(to: p(29, 18))
            path.addCurve(to: p(32, 12), control1: p(29, 14.5), control2: p(29.8, 12))
            path.closeSubpath()
            path.addRoundedRect(in: CGRect(origin: p(9, 23), size: CGSize(width: 46 * k, height: 6.5 * k)), cornerSize: CGSize(width: 3 * k, height: 3 * k))
            path.addRoundedRect(in: CGRect(origin: p(23, 45), size: CGSize(width: 18 * k, height: 4.5 * k)), cornerSize: CGSize(width: 2.2 * k, height: 2.2 * k))
            return path
        }
    }
}

/// Where the map opens: on the pilot's last position, kept on the phone,
/// at the web map's opening zoom (lib/map/ownShip OPEN_ZOOM, 8), in the
/// middle of what the sheet leaves -- under the loading mark -- with the
/// sheet's height as it is when the map is put there, not as it was when
/// the map was made (the web's #543: a sheet that settled while the map
/// loaded left the position below the mark).
enum MapOpening {
    static let zoom = 8.0
    static let key = "map.lastPosition"
    /// Another opening zoom asked for at launch (`-map.openZoom 15`, the
    /// arguments' defaults), for the pictures of the map close in; nil
    /// otherwise.
    static var zoomAsked: Double? {
        let asked = UserDefaults.standard.double(forKey: "map.openZoom")
        return asked > 0 ? asked : nil
    }
    /// The Great Lakes, before any position is known: the web's opening view.
    static let fallback = CLLocationCoordinate2D(latitude: 42.3, longitude: -88.0)

    /// The height of the middle of what the sheet leaves, from the top of
    /// a map `height` tall with `top` under the status bar.
    static func middle(height: CGFloat, top: CGFloat, bottomInset: CGFloat) -> CGFloat {
        (top + height - bottomInset) / 2
    }

    /// How far below a point the map's own middle is put, for the point to
    /// sit in the middle of what the sheet leaves.
    static func drop(height: CGFloat, top: CGFloat, bottomInset: CGFloat) -> CGFloat {
        height / 2 - middle(height: height, top: top, bottomInset: bottomInset)
    }

    /// The longitude a map `width` points wide spans at a Leaflet zoom
    /// (MapExtras.zoom's inverse).
    static func longitudeDelta(zoom: Double, width: Double) -> Double {
        360 * width / 256 / pow(2, zoom)
    }

    static func remembered(_ defaults: UserDefaults = .standard) -> CLLocationCoordinate2D? {
        guard let kept = defaults.array(forKey: key) as? [Double], kept.count == 2,
              (-90...90).contains(kept[0]), (-180...180).contains(kept[1]) else { return nil }
        return CLLocationCoordinate2D(latitude: kept[0], longitude: kept[1])
    }

    static func remember(_ at: CLLocationCoordinate2D, _ defaults: UserDefaults = .standard) {
        defaults.set([at.latitude, at.longitude], forKey: key)
    }
}
