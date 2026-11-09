import SwiftUI
import UIKit

/// The kneeboard card: the flight on one half-letter page to fly with --
/// the route, the airplane and the totals; the legs' altitude, heading,
/// distance, ground speed, time and fuel, with ETA, ATA and fuel left to
/// fill in; and the lines for the squawk and the clearance. Black on
/// white whatever the theme (the web app's Kneeboard). A printed page at
/// a fixed size, rendered to PDF and never shown on screen, so its type
/// is in points and does not follow Dynamic Type.
struct Kneeboard: View {
    let route: String
    let aircraft: String
    let totals: Totals?
    let legs: [Leg]
    /// An airplane picked. Without one each leg's magnetic course takes
    /// the heading's place (the wind's correction is at an airplane's
    /// speed), and the groundspeed, time and fuel are left blank, not
    /// assumed (docs/decisions/0011).
    var airplane = true

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text(route).font(.system(size: 15, weight: .bold))
                Spacer()
                Text("Date ________").font(.system(size: 9))
            }
            Rectangle().frame(height: 1.5)
            Text(summary).font(.system(size: 9))
            Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 3) {
                GridRow {
                    ForEach(["Checkpoint", "Alt", airplane ? "MH" : "MC", "Dist", "GS", "ETE", "ETA", "ATA", "Fuel", "Rem"], id: \.self) { Text($0).bold() }
                }
                Divider().gridCellUnsizedAxes(.horizontal)
                ForEach(Array(legs.enumerated()), id: \.offset) { _, leg in
                    GridRow {
                        Text(leg.to).lineLimit(1)
                        Text(Int(leg.altitudeFt).formatted())
                        Text((airplane ? leg.magneticHeadingDeg : Optional(leg.magneticCourseDeg)).map { Format.number($0, decimals: 0).leftPadded(to: 3) } ?? "")
                        Text(Format.number(leg.distanceNm, decimals: 1))
                        Text(airplane ? leg.groundspeedKt.map { Format.number($0, decimals: 0) } ?? "" : "")
                        Text(airplane ? leg.eteMin.map { Format.number($0, decimals: 1) } ?? "" : "")
                        Text("")
                        Text("")
                        Text(airplane ? leg.fuelGal.map { Format.number($0, decimals: 1) } ?? "" : "")
                        Text("")
                    }
                    Divider().gridCellUnsizedAxes(.horizontal)
                }
            }
            .font(.system(size: 8.5).monospacedDigit())
            Text("Squawk ______   Clearance ____________________   Hobbs out ______ in ______").font(.system(size: 9)).padding(.top, WingtipSpace.sm)
            Spacer(minLength: 0)
            Text("Wingtip Maps · a planning aid: check the charts, NOTAMs and an official briefing before flight.").font(.system(size: 6.5))
        }
        .padding(WingtipSpace.xl)
        .frame(width: 396, height: 612, alignment: .topLeading)
        .foregroundStyle(.black)
        .background(.white)
        .environment(\.colorScheme, .light)
    }

    /// The airplane and the totals it has: with no airplane chosen the
    /// planner sends the miles alone, and the line leaves the rest out.
    private var summary: String {
        let parts: [String?] = [
            aircraft,
            totals.map { Format.distance($0.distanceNm) },
            airplane ? totals?.eteMin.map(Format.duration) : nil,
            airplane ? totals?.fuelGal.map { Format.fuel($0) } : nil,
            airplane ? totals?.fuelRequiredGal.map { "(\(Format.number($0, decimals: 1)) with reserve)" } : nil,
        ]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    /// The page as a PDF in the temporary folder, for the share sheet.
    @MainActor
    static func pdf(_ plan: Plan) -> URL? {
        let page = Kneeboard(route: plan.idents.joined(separator: " → "), aircraft: plan.airplaneName ?? "No airplane", totals: plan.totals, legs: plan.legs,
                             airplane: plan.airplaneChosen)
        let url = FileManager.default.temporaryDirectory.appending(path: "\(RouteShare.fileName(plan))-nav-log.pdf")
        let renderer = ImageRenderer(content: page)
        var made = false
        renderer.render { size, draw in
            var box = CGRect(origin: .zero, size: size)
            guard let context = CGContext(url as CFURL, mediaBox: &box, nil) else { return }
            context.beginPDFPage(nil)
            draw(context)
            context.endPDFPage()
            context.closePDF()
            made = true
        }
        return made ? url : nil
    }
}
