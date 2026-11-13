import Foundation
import MetricKit

/// MetricKit's payloads read into the gateway's diagnostics report and
/// sent (POST /api/diagnostics), so the owner sees this app's crashes,
/// hangs and launch times from real phones beside the web's (the trust
/// and quality work, 2026-11-09). Only what the payload says of the app
/// is read: the fault's kind and line, its call stack and the day's
/// figures. Sent with no cookie, so a report is never the pilot's.
enum DiagnosticsReporter {
    /// The diagnostics a payload holds -- each crash, hang, CPU and disk
    /// write exception -- as faults, at the payload's end (MetricKit sends
    /// a diagnostic as it comes, and dates the payload, not each one).
    static func report(_ payload: MXDiagnosticPayload, from blank: GWDiagnosticsReport) -> GWDiagnosticsReport {
        var report = blank
        let at = payload.timeStampEnd
        for crash in payload.crashDiagnostics ?? [] {
            let signature = GWDiagnosticsReport.crashSignature(
                exceptionName: crash.exceptionReason.map { "\($0.className): \($0.exceptionName)" },
                exceptionType: crash.exceptionType?.intValue, exceptionCode: crash.exceptionCode?.intValue,
                signal: crash.signal?.intValue, terminationReason: crash.terminationReason)
            report.add(kind: "crash", signature: signature, detail: stack(crash.callStackTree), at: at)
        }
        for hang in payload.hangDiagnostics ?? [] {
            // Whole seconds, so hangs of a like length group under one line.
            let seconds = Int(hang.hangDuration.converted(to: .seconds).value)
            report.add(kind: "hang", signature: "Hang of \(seconds) s or more", detail: stack(hang.callStackTree), at: at)
        }
        for cpu in payload.cpuExceptionDiagnostics ?? [] {
            let used = Int(cpu.totalCPUTime.converted(to: .seconds).value)
            let over = Int(cpu.totalSampledTime.converted(to: .seconds).value)
            report.add(kind: "cpu", signature: "CPU exception: \(used) s of CPU in \(over) s", detail: stack(cpu.callStackTree), at: at)
        }
        for disk in payload.diskWriteExceptionDiagnostics ?? [] {
            let megabytes = Int(disk.totalWritesCaused.converted(to: .megabytes).value)
            report.add(kind: "disk", signature: "Disk write exception: \(megabytes) MB", detail: stack(disk.callStackTree), at: at)
        }
        return report
    }

    /// The day's figures the owner steers by: launch to first draw at the
    /// 50th and 95th percentile, resume at the 50th, the hang time, the
    /// share of scrolling spent hitching, the peak memory and the exits
    /// the system forced for memory.
    static func report(_ payload: MXMetricPayload, from blank: GWDiagnosticsReport) -> GWDiagnosticsReport {
        var report = blank
        let launch = buckets(payload.applicationLaunchMetrics?.histogrammedTimeToFirstDraw, in: .milliseconds)
        report.measure("launch_ms_p50", GWDiagnosticsReport.percentile(0.5, of: launch))
        report.measure("launch_ms_p95", GWDiagnosticsReport.percentile(0.95, of: launch))
        let resume = buckets(payload.applicationLaunchMetrics?.histogrammedApplicationResumeTime, in: .milliseconds)
        report.measure("resume_ms_p50", GWDiagnosticsReport.percentile(0.5, of: resume))
        let hangs = buckets(payload.applicationResponsivenessMetrics?.histogrammedApplicationHangTime, in: .seconds)
        if !hangs.isEmpty { report.measure("hang_s", GWDiagnosticsReport.total(of: hangs)) }
        if let hitch = payload.animationMetrics?.scrollHitchTimeRatio {
            report.measure("hitch_ratio", hitchRatio(value: hitch.value, symbol: hitch.unit.symbol))
        }
        // Memory: the day's peak, and how often the system ended the app
        // for using too much, in the foreground (the pilot saw it go) and
        // in the background (the chart was gone on return) -- a crash
        // report never comes for either, as no crash happened.
        if let peak = payload.memoryMetrics?.peakMemoryUsage {
            report.measure("memory_mb_peak", peak.converted(to: .megabytes).value)
        }
        if let exits = payload.applicationExitMetrics {
            report.measure("exits_memory_fg", Double(exits.foregroundExitData.cumulativeMemoryResourceLimitExitCount))
            report.measure("exits_memory_bg", Double(exits.backgroundExitData.cumulativeMemoryResourceLimitExitCount
                    + exits.backgroundExitData.cumulativeMemoryPressureExitCount))
        }
        return report
    }

    /// MetricKit's hitch time ratio as a share of the time scrolled: its
    /// header calls it dimensionless, but its payloads write it in
    /// milliseconds per second ("ms per s"), a thousandth of which it is.
    static func hitchRatio(value: Double, symbol: String) -> Double {
        symbol.hasPrefix("ms") ? value / 1000 : value
    }

    /// A histogram's buckets as upper ends in `unit`, with their counts.
    static func buckets(_ histogram: MXHistogram<UnitDuration>?, in unit: UnitDuration) -> [(upper: Double, count: Int)] {
        guard let histogram else { return [] }
        var out: [(upper: Double, count: Int)] = []
        for bucket in histogram.bucketEnumerator {
            guard let bucket = bucket as? MXHistogramBucket<UnitDuration> else { continue }
            out.append((bucket.bucketEnd.converted(to: unit).value, bucket.bucketCount))
        }
        return out
    }

    private static func stack(_ tree: MXCallStackTree) -> String {
        String(decoding: tree.jsonRepresentation(), as: UTF8.self)
    }

    /// A session of its own with no cookies, so the pilot's sign-in is
    /// never sent with a report, and nothing is cached.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.waitsForConnectivity = true
        config.timeoutIntervalForResource = 24 * 3600
        return URLSession(configuration: config)
    }()

    /// The report sent; the gateway answers 204 whether it kept it or
    /// dropped it past its hourly allowance, and 400 for one it cannot
    /// read, which is logged for the next build to put right.
    static func send(_ report: GWDiagnosticsReport) async {
        guard !report.isEmpty else { return }
        do {
            var request = URLRequest(url: Config.gateway.appending(path: "/api/diagnostics"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try report.json()
            let (_, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status != 204 { Log.metrics.error("the diagnostics report was refused: \(status)") }
        } catch {
            Log.metrics.notice("the diagnostics report was not sent: \(error.localizedDescription, privacy: .public)")
        }
    }
}
