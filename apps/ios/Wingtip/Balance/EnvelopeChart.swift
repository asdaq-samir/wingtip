import Charts
import SwiftUI

/// The POH's centre-of-gravity envelope -- weight up, arm across -- with
/// the takeoff and landing points on it and the line the fuel burnt takes
/// between them, as the loading graph is read (the web's EnvelopeChart):
/// Swift Charts, the system's own, its marks' VoiceOver values its own.
struct EnvelopeChart: View {
    let outline: [LoadingModel.Point]
    let takeoff: LoadingModel.Point?
    let landing: LoadingModel.Point?
    /// Within the limits: the points in the tint; out, in the stop colour.
    let within: Bool

    var body: some View {
        let points = [takeoff, landing].compactMap { $0 }
        if let room = LoadingModel.domains(outline + points) {
            Chart {
                ForEach(outline) { p in
                    LineMark(x: .value("Arm", p.armIn), y: .value("Weight", p.weightLb), series: .value("Line", "Envelope"))
                        .foregroundStyle(.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                }
                ForEach(points) { p in
                    LineMark(x: .value("Arm", p.armIn), y: .value("Weight", p.weightLb), series: .value("Line", "Loaded"))
                        .foregroundStyle(colour)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                }
                if let takeoff { mark(takeoff, "Takeoff", at: .top) }
                if let landing { mark(landing, "Landing", at: .bottom) }
            }
            .chartXScale(domain: room.arm)
            .chartYScale(domain: room.weight)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 6)) { value in
                    AxisGridLine()
                    AxisValueLabel { if let arm = value.as(Double.self) { Text("\(Format.number(arm, decimals: 0)) in") } }
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 6)) { value in
                    AxisGridLine()
                    AxisValueLabel { if let lb = value.as(Double.self) { Text(Format.grouped(lb)) } }
                }
            }
            .frame(minHeight: 224)
            .accessibilityLabel("Weight and balance envelope")
            .accessibilityIdentifier("envelope-chart")
        }
    }

    private var colour: Color { within ? Color.accentColor : FindingStyle.colour("stop") }

    @ChartContentBuilder
    private func mark(_ p: LoadingModel.Point, _ name: String, at side: AnnotationPosition) -> some ChartContent {
        PointMark(x: .value("Arm", p.armIn), y: .value("Weight", p.weightLb))
            .foregroundStyle(colour)
            .symbolSize(81)
            .annotation(position: side) { Text(name).font(.caption) }
            .accessibilityLabel(name)
            .accessibilityValue("\(Format.grouped(p.weightLb)) pounds at \(Format.number(p.armIn, decimals: 1)) inches")
    }
}
