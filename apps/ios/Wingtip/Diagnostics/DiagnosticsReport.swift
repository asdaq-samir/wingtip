import Foundation

/// What the gateway's POST /api/diagnostics takes (DiagnosticsController's
/// DiagnosticsReport): the app's faults and speed from this phone, with
/// nothing of the pilot's in it -- no account, no position, no N-number,
/// no route. The version, the system and the kind of device say which
/// build a crash is in; the gateway scrubs what slips into a call stack
/// (queries, addresses, home paths, ids) before it keeps a fault 30 days.
/// Built from plain values, so the rules of the body are tested without
/// MetricKit's payloads, which a test cannot make (DiagnosticsReporter
/// reads those).
struct DiagnosticsReport: Codable, Equatable, Sendable {
    struct Fault: Codable, Equatable, Sendable {
        /// The gateway's kinds: crash, hang, exit, error, exception, cpu, disk.
        let kind: String
        /// One line naming the fault, as the gateway groups faults by it.
        let signature: String
        /// MetricKit's call stack tree, as its JSON.
        let detail: String?
        let at: Date?
    }

    var platform = "ios"
    let version: String
    let os: String
    let device: String
    var faults: [Fault] = []
    var metrics: [String: Double] = [:]

    // The gateway's limits (DiagnosticsController), kept here so a report
    // is never refused whole for one long field.
    static let maxFaults = 20
    static let maxMetrics = 30
    static let maxSignature = 2000
    static let maxDetail = 64000
    static let maxOs = 40

    /// The report for this build on this kind of device.
    init(version: String, os: String, tablet: Bool) {
        self.version = version
        self.os = String(os.prefix(Self.maxOs))
        self.device = tablet ? "tablet" : "phone"
    }

    /// A fault added within the gateway's limits: one line, cut to its
    /// length; past twenty, the rest wait for no one (the gateway would
    /// refuse the report).
    mutating func add(kind: String, signature: String, detail: String?, at: Date?) {
        guard faults.count < Self.maxFaults else { return }
        let line = signature.split(whereSeparator: \.isNewline).joined(separator: " ").trimmingCharacters(in: .whitespaces)
        faults.append(Fault(kind: kind, signature: String((line.isEmpty ? kind : line).prefix(Self.maxSignature)),
                            detail: detail.map { String($0.prefix(Self.maxDetail)) }, at: at))
    }

    /// A figure added where it is one the gateway keeps: a finite number
    /// from 0 to 100,000,000, under thirty names.
    mutating func measure(_ name: String, _ value: Double?) {
        guard let value, value.isFinite, value >= 0, value <= 100_000_000, metrics.count < Self.maxMetrics else { return }
        metrics[name] = value
    }

    var isEmpty: Bool { faults.isEmpty && metrics.isEmpty }

    /// The body as the gateway reads it: ISO-8601 instants.
    func json() throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = .sortedKeys
        return try encoder.encode(self)
    }

    // MARK: The parts of a fault and a figure

    /// A crash's one line: the Objective-C exception where there was one,
    /// else the Mach exception, its code and the signal, and the system's
    /// reason for ending the app (a watchdog's, a memory limit's).
    static func crashSignature(exceptionName: String?, exceptionType: Int?, exceptionCode: Int?, signal: Int?, terminationReason: String?) -> String {
        var parts: [String] = []
        if let exceptionName, !exceptionName.isEmpty { parts.append(exceptionName) }
        if let exceptionType { parts.append("exception \(exceptionType)") }
        if let exceptionCode { parts.append("code \(exceptionCode)") }
        if let signal { parts.append("signal \(signal)\(signalName(signal).map { " (\($0))" } ?? "")") }
        if let terminationReason, !terminationReason.isEmpty { parts.append(terminationReason) }
        return parts.isEmpty ? "crash" : parts.joined(separator: ", ")
    }

    /// The common signals by name, as a crash report writes them.
    static func signalName(_ signal: Int) -> String? {
        [4: "SIGILL", 5: "SIGTRAP", 6: "SIGABRT", 9: "SIGKILL", 10: "SIGBUS", 11: "SIGSEGV"][signal]
    }

    /// A histogram's 50th and 95th percentile, from its buckets' upper
    /// ends and counts (MetricKit gives counts per bucket, not samples):
    /// the end of the bucket where the share is reached. Nil with no samples.
    static func percentile(_ share: Double, of buckets: [(upper: Double, count: Int)]) -> Double? {
        let total = buckets.reduce(0) { $0 + $1.count }
        guard total > 0 else { return nil }
        var seen = 0
        for bucket in buckets {
            seen += bucket.count
            if Double(seen) / Double(total) >= share { return bucket.upper }
        }
        return buckets.last?.upper
    }

    /// A histogram's total, each bucket's upper end by its count.
    static func total(of buckets: [(upper: Double, count: Int)]) -> Double {
        buckets.reduce(0) { $0 + $1.upper * Double($1.count) }
    }
}

/// The app's version as Settings > General > About and a crash report
/// write it: the marketing version and the build, "1.0 (1)".
struct AppVersion: Equatable, Sendable {
    let short: String
    let build: String

    init(short: String, build: String) {
        self.short = short
        self.build = build
    }

    /// From a bundle's Info.plist (CFBundleShortVersionString, CFBundleVersion);
    /// "unknown" for one it lacks, a word the gateway's version takes.
    init(info: [String: Any]?) {
        short = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        build = info?["CFBundleVersion"] as? String ?? "unknown"
    }

    static let current = AppVersion(info: Bundle.main.infoDictionary)

    /// "1.0 (1)", cut to the gateway's 40 characters of its own alphabet.
    var text: String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._ ()+-")
        let clean = String(String.UnicodeScalarView("\(short) (\(build))".unicodeScalars.filter { allowed.contains($0) }))
        return String(clean.prefix(40))
    }
}
