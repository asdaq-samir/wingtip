import Foundation
import MetricKit
import os
import UIKit

/// The app's own measurements from the phones that run it, as Apple
/// delivers them (MetricKit): launch times, hangs, battery and the
/// cellular and Wi-Fi traffic of each day, and a diagnostic for each
/// crash, hang and disk-write exception, without a third-party kit. The
/// payloads are written to the system log, where Xcode's Organizer and
/// a device's sysdiagnose show them, with the figures the owner steers
/// by: the launch time at the 50th and 95th percentile, the hang time
/// and the energy (the owner's ask for a fast app, measured, 2026-11-03).
/// The owner's Mac cannot run a current Xcode, so these and the runner's
/// performance tests are the numbers, not Instruments traces. Each
/// payload is also sent to the gateway (DiagnosticsReporter), with nothing
/// of the pilot's, so the owner sees the phones' faults and speed beside
/// the web's without a device in hand.
@MainActor
final class Metrics: NSObject, MXMetricManagerSubscriber {
    static let shared = Metrics()
    private let log = Log.metrics
    private var started = false
    /// The report every payload is read into: this build, this system and
    /// this kind of device, read once on the main actor, where UIDevice is.
    private nonisolated let blank: GWDiagnosticsReport
    /// Launch to the map's first draw, an interval Instruments shows under
    /// the app's subsystem: the chart itself in, which MetricKit's time to
    /// first draw (the first frame of any view) cannot see.
    private let signposter = OSSignposter(subsystem: Log.subsystem, category: "launch")
    private var launching: OSSignpostIntervalState?

    override init() {
        let device = UIDevice.current
        blank = GWDiagnosticsReport(version: AppVersion.current.text, os: "iOS \(device.systemVersion)",
                                    tablet: device.userInterfaceIdiom == .pad)
        super.init()
    }

    /// Subscribed once, at launch: MetricKit delivers a payload about once
    /// a day, for the previous day, and any diagnostics as they come.
    func start() {
        guard !started else { return }
        started = true
        launching = signposter.beginInterval("Launch to map")
        MXMetricManager.shared.add(self)
    }

    /// The map has drawn its chart and overlays (ChartMap's reveal): the
    /// launch interval ends, once.
    func mapShown() {
        guard let launching else { return }
        signposter.endInterval("Launch to map", launching)
        self.launching = nil
    }

    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            // The whole payload as JSON, so nothing Apple measures is lost,
            // and the three figures that matter as a line of their own.
            let launch = payload.applicationLaunchMetrics?.histogrammedTimeToFirstDraw
            let hang = payload.applicationResponsivenessMetrics?.histogrammedApplicationHangTime
            let summary = "launch p50/p95 \(Self.percentiles(launch)); hang \(Self.total(hang)); cpu \(payload.cpuMetrics?.cumulativeCPUTime.description ?? "?")"
            let report = DiagnosticsReporter.report(payload, from: blank)
            Task { await DiagnosticsReporter.send(report) }
            // Read here, so the payload itself never crosses to the main actor.
            let (begin, end) = (payload.timeStampBegin, payload.timeStampEnd)
            let json = String(decoding: payload.jsonRepresentation(), as: UTF8.self)
            Task { @MainActor in
                self.log.notice("metrics \(begin, privacy: .public) to \(end, privacy: .public): \(summary, privacy: .public)")
                self.log.debug("\(json, privacy: .public)")
            }
        }
    }

    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let crashes = payload.crashDiagnostics?.count ?? 0
            let hangs = payload.hangDiagnostics?.count ?? 0
            let report = DiagnosticsReporter.report(payload, from: blank)
            Task { await DiagnosticsReporter.send(report) }
            let begin = payload.timeStampBegin
            let json = String(decoding: payload.jsonRepresentation(), as: UTF8.self)
            Task { @MainActor in
                self.log.error("diagnostics \(begin, privacy: .public): \(crashes) crashes, \(hangs) hangs")
                self.log.debug("\(json, privacy: .public)")
            }
        }
    }

    /// A histogram's 50th and 95th percentile, in milliseconds, for the log.
    private nonisolated static func percentiles(_ histogram: MXHistogram<UnitDuration>?) -> String {
        guard histogram != nil else { return "?" }
        let buckets = DiagnosticsReporter.buckets(histogram, in: .milliseconds)
        guard let p50 = GWDiagnosticsReport.percentile(0.5, of: buckets),
              let p95 = GWDiagnosticsReport.percentile(0.95, of: buckets) else { return "none" }
        return "\(Int(p50)) ms / \(Int(p95)) ms"
    }

    /// A histogram's total time, in seconds, for the log.
    private nonisolated static func total(_ histogram: MXHistogram<UnitDuration>?) -> String {
        guard histogram != nil else { return "?" }
        return "\(Format.number(GWDiagnosticsReport.total(of: DiagnosticsReporter.buckets(histogram, in: .seconds)), decimals: 1)) s"
    }
}
