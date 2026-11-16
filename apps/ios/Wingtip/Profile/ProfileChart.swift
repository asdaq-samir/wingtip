import Charts
import SwiftUI

/// The side view itself, in Swift Charts (docs/design/ios.md §4): the
/// ground as an area in the chart's terrain brown, Class B and C as faint
/// bands in the sectional's airspace blue and magenta, the altitude flown
/// across them in the tint, and the previewed altitude as a dashed rule.
/// The ground the engine finds within 1,000 ft of the preview is drawn in
/// the chart's caution amber and within 500 ft (or above it) in its
/// warning red, 14 CFR 91.119(c)'s least height (`profile_clearance`). Each
/// waypoint is a mark a tap opens (`onWaypoint`), the nearest within
/// 22 pt either side, a 44 pt target (HIG Buttons). Swift Charts gives
/// VoiceOver its Audio Graph; every figure is also in the rows (HIG
/// Charts: never only in a chart). Nothing is worked out here.
struct ProfileChart: View {
    let profile: RouteProfile?
    let legs: [Leg]
    /// The altitude previewed, feet MSL.
    let previewFt: Double?
    let clearance: ProfileRules.Clearance?
    var onWaypoint: ((String) -> Void)?

    private var waypoints: [(ident: String, alongNm: Double)] { ProfileRules.waypoints(legs: legs) }

    /// The altitude line's points along the route: the legs' own.
    private var flown: [(nm: Double, ft: Double)] {
        guard let first = legs.first else { return [] }
        var along = 0.0
        var points = [(nm: 0.0, ft: first.altitudeFt)]
        for leg in legs {
            along += leg.distanceNm
            points.append((nm: along, ft: leg.altitudeFt))
        }
        return points
    }

    var body: some View {
        if let profile, profile.lengthNm > 0, !profile.terrain.isEmpty {
            let highest = max(profile.terrain.map(\.groundFt).max() ?? 0, previewFt ?? 0, legs.map(\.altitudeFt).max() ?? 0, 3000)
            let top = (highest * 1.25 / 1000).rounded(.up) * 1000
            Chart {
                ForEach(Array(profile.airspace.enumerated()), id: \.offset) { _, area in
                    RectangleMark(xStart: .value("From", area.fromNm), xEnd: .value("To", area.toNm),
                                  yStart: .value("Floor", area.floorFt), yEnd: .value("Ceiling", min(area.ceilingFt ?? top, top)))
                        .foregroundStyle(Self.colour(area.airspaceClass).opacity(0.14))
                        .accessibilityLabel("Class \(area.airspaceClass), \(area.name)")
                }
                ForEach(Array(profile.terrain.enumerated()), id: \.offset) { _, point in
                    AreaMark(x: .value("Along", point.alongNm), y: .value("Ground", point.groundFt), series: .value("Band", "Ground"))
                        .foregroundStyle(Color(uiColor: WingtipColor.Chart.terrain).opacity(0.75))
                        .accessibilityHidden(true)
                }
                if let clearance {
                    band(profile, from: clearance.yellowFromFt, colour: WingtipColor.Chart.caution, name: "Within 1,000 ft")
                    band(profile, from: clearance.redFromFt, colour: WingtipColor.Chart.warning, name: "Within 500 ft")
                }
                ForEach(Array(flown.enumerated()), id: \.offset) { _, point in
                    LineMark(x: .value("Along", point.nm), y: .value("Altitude", point.ft), series: .value("Line", "Altitude"))
                        .foregroundStyle(.tint)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineJoin: .round))
                        .accessibilityHidden(true)
                }
                if let previewFt {
                    RuleMark(y: .value("Preview", previewFt))
                        .foregroundStyle(.tint)
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                        .accessibilityHidden(true)
                }
                // A dot at each point, the route's two ends named: the
                // points' own names piled into one unreadable strip on a
                // route of eight (IOS-5); they are in the nav log's rows,
                // and a tap on a dot opens its point.
                ForEach(Array(waypoints.enumerated()), id: \.offset) { i, point in
                    let end = i == 0 || i == waypoints.count - 1
                    PointMark(x: .value("Along", point.alongNm), y: .value("Altitude", altitude(at: point.alongNm)))
                        .foregroundStyle(.tint)
                        .symbolSize(50)
                        .annotation(position: .top, spacing: WingtipSpace.xs) {
                            if end { Text(point.ident).font(.caption2.monospaced()).foregroundStyle(.tint) }
                        }
                        .accessibilityHidden(true)
                }
            }
            .chartXScale(domain: 0...profile.lengthNm)
            .chartYScale(domain: 0...top)
            .chartXAxisLabel("nm")
            .chartYAxisLabel("ft")
            .chartGesture { proxy in
                SpatialTapGesture().onEnded { tap in
                    if let ident = nearest(to: tap.location.x, proxy: proxy) { onWaypoint?(ident) }
                }
                // A tap, never a drag: the slider beside it previews, and the
                // card's own drag stays the sheet's (the scrolling rule).
            }
            .padding(WingtipSpace.md)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("The route from the side")
            .accessibilityValue(clearance?.words ?? "")
            // Each waypoint's popover by name, for VoiceOver and Switch Control.
            .accessibilityActions {
                ForEach(waypoints, id: \.ident) { point in
                    Button("Altitude at \(point.ident)") { onWaypoint?(point.ident) }
                }
            }
        } else {
            ContentUnavailableView("No Profile Yet", systemImage: "mountain.2", description: Text("Plan the route to see it from the side."))
        }
    }

    /// The ground above `from`, in `colour`: zero-high where it is below.
    @ChartContentBuilder
    private func band(_ profile: RouteProfile, from: Double, colour: UIColor, name: String) -> some ChartContent {
        ForEach(Array(profile.terrain.enumerated()), id: \.offset) { _, point in
            AreaMark(x: .value("Along", point.alongNm),
                     yStart: .value("From", min(point.groundFt, from)),
                     yEnd: .value("Ground", point.groundFt),
                     series: .value("Band", name))
                .foregroundStyle(Color(uiColor: colour))
                .accessibilityHidden(true)
        }
    }

    /// The altitude flown at a distance along: the leg ending there's.
    private func altitude(at nm: Double) -> Double {
        flown.last { $0.nm <= nm + 0.01 }?.ft ?? flown.first?.ft ?? 0
    }

    /// The waypoint nearest a tap, within 22 pt either side.
    private func nearest(to x: CGFloat, proxy: ChartProxy) -> String? {
        // The tap and 22 pt beside it in miles along, as the chart reads them.
        guard let at: Double = proxy.value(atX: x), let beside: Double = proxy.value(atX: x + 22) else { return nil }
        let reach = abs(beside - at)
        return waypoints
            .map { (ident: $0.ident, off: abs($0.alongNm - at)) }
            .filter { $0.off <= reach }
            .min { $0.off < $1.off }?.ident
    }

    /// Class B in the sectional's blue, C in its magenta (FAA Chart
    /// User's Guide, Airspace), the rest grey.
    static func colour(_ airspaceClass: String) -> Color {
        switch airspaceClass {
        case "B": Color(uiColor: WingtipColor.Chart.airspaceBlue)
        case "C": Color(uiColor: WingtipColor.Chart.airspaceMagenta)
        default: Color(uiColor: WingtipColor.Chart.fieldUnknown)
        }
    }
}
