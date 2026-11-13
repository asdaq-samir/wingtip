import Foundation
import Testing
@testable import Wingtip

/// The trust and quality work (2026-11-09): the diagnostics report the
/// gateway takes (DiagnosticsController's limits), About's version text
/// and credits, the export's file name, and the demo flight every app
/// shares (the web's demoFlight.ts, Android's DemoFlight.kt).
struct TrustTests {
    // MARK: The diagnostics report

    @Test func aReportCarriesThePlatformBuildAndDeviceAndNothingElse() throws {
        var report = GWDiagnosticsReport(version: "1.0 (7)", os: "iOS 26.1", tablet: false)
        report.add(kind: "crash", signature: "signal 11 (SIGSEGV)", detail: "{}", at: Date(timeIntervalSince1970: 0))
        let body = try JSONSerialization.jsonObject(with: try report.json()) as? [String: Any]
        #expect(Set(body?.keys.map { $0 } ?? []) == ["platform", "version", "os", "device", "page", "faults", "metrics"])
        #expect(body?["platform"] as? String == "ios")
        #expect(body?["device"] as? String == "phone")
        #expect(body?["page"] as? String == "app")
        let fault = (body?["faults"] as? [[String: Any]])?.first
        #expect(fault?["at"] as? String == "1970-01-01T00:00:00Z")
        #expect(GWDiagnosticsReport(version: "1", os: "iOS", tablet: true).device == "tablet")
    }

    @Test func aFaultIsOneLineAndTheGatewayHoldsTheLimits() {
        var report = GWDiagnosticsReport(version: "1", os: "iOS", tablet: false)
        report.add(kind: "crash", signature: "NSRangeException:\nindex 3 beyond bounds", detail: String(repeating: "a", count: 70_000), at: .now)
        report.add(kind: "cpu", signature: "  ", detail: nil, at: .now)
        #expect(report.faults[0].signature == "NSRangeException: index 3 beyond bounds")
        #expect(report.faults[0].detail.count == 70_000)
        #expect(report.faults[1].signature == "cpu")
    }

    @Test func onlyFiniteFiguresAreMeasured() {
        var report = GWDiagnosticsReport(version: "1", os: "iOS", tablet: false)
        report.measure("launch_ms_p50", 420)
        report.measure("hang_s", nil)
        report.measure("nan", .nan)
        #expect(report.metrics.additionalProperties == ["launch_ms_p50": 420])
        #expect(!report.isEmpty)
        #expect(GWDiagnosticsReport(version: "1", os: "iOS", tablet: false).isEmpty)
    }

    @Test func aCrashIsNamedByItsExceptionSignalAndReason() {
        #expect(GWDiagnosticsReport.crashSignature(exceptionName: nil, exceptionType: 1, exceptionCode: 0, signal: 11, terminationReason: nil)
            == "exception 1, code 0, signal 11 (SIGSEGV)")
        #expect(GWDiagnosticsReport.crashSignature(exceptionName: "NSException: NSRangeException", exceptionType: nil, exceptionCode: nil, signal: 6,
                                                   terminationReason: "Namespace SPRINGBOARD, Code 0x8badf00d")
                == "NSException: NSRangeException, signal 6 (SIGABRT), Namespace SPRINGBOARD, Code 0x8badf00d")
        #expect(GWDiagnosticsReport.crashSignature(exceptionName: nil, exceptionType: nil, exceptionCode: nil, signal: nil, terminationReason: nil) == "crash")
    }

    @Test func percentilesAreTheBucketWhereTheShareIsReached() {
        // 10 launches: 5 under 300 ms, 4 under 600, 1 under 2000.
        let buckets: [(upper: Double, count: Int)] = [(300, 5), (600, 4), (2000, 1)]
        #expect(GWDiagnosticsReport.percentile(0.5, of: buckets) == 300)
        #expect(GWDiagnosticsReport.percentile(0.95, of: buckets) == 2000)
        #expect(GWDiagnosticsReport.percentile(0.5, of: []) == nil)
        #expect(GWDiagnosticsReport.total(of: [(1, 2), (3, 1)]) == 5)
    }

    @Test func theHitchRatioIsAShareOfTheTimeScrolled() {
        #expect(DiagnosticsReporter.hitchRatio(value: 25, symbol: "ms per s") == 0.025)
        #expect(DiagnosticsReporter.hitchRatio(value: 0.025, symbol: "") == 0.025)
    }

    // MARK: About

    @Test func theVersionIsWrittenAsSettingsWritesIt() {
        let version = AppVersion(info: ["CFBundleShortVersionString": "1.2", "CFBundleVersion": "34"])
        #expect(version.short == "1.2")
        #expect(version.build == "34")
        #expect(version.text == "1.2 (34)")
        #expect(AppVersion(info: nil).text == "unknown (unknown)")
        // Only the gateway's characters, and at most 40 of them.
        #expect(AppVersion(short: "1.0β", build: String(repeating: "9", count: 50)).text.count == 40)
        #expect(AppVersion(short: "1.0β", build: "2").text == "1.0 (2)")
    }

    @Test func theCreditsAreTheIPhonesShareOfTheList() {
        #expect(AboutCredits.data.count == 17)
        #expect(AboutCredits.data.first?.what == "FAA aeronautical charts: sectional, terminal area and IFR enroute")
        #expect(AboutCredits.software.map(\.what) == ["Apple MapKit"])
        #expect(PlanningAid.words.hasPrefix("Wingtip Maps is a planning aid for VFR and IFR flight."))
        #expect(PlanningAid.words.hasSuffix("applicable regulations (14 CFR 91.103)."))
    }

    @Test func theLegalPagesAreOnTheSitesHost() {
        #expect(AboutModel.page("privacy", host: "wingtipmaps.app").absoluteString == "https://wingtipmaps.app/privacy")
        #expect(AboutModel.page("support", host: "example.org").absoluteString == "https://example.org/support")
    }

    // MARK: Export My Data

    @Test func theExportIsSavedUnderTheGatewaysName() {
        #expect(DataExport.fileName(contentDisposition: "attachment; filename=\"wingtip-maps-2026-11-09.json\"") == "wingtip-maps-2026-11-09.json")
        #expect(DataExport.fileName(contentDisposition: "attachment; filename=\"../../evil.json\"") == "..-..-evil.json")
        let day = Date(timeIntervalSince1970: 1_800_000_000)
        let fallback = DataExport.fileName(contentDisposition: nil, today: day)
        #expect(fallback.hasPrefix("wingtip-maps-20"))
        #expect(fallback.hasSuffix(".json"))
    }

    // MARK: The demo flight

    @Test func theDemoFlightIsMadisonToOshkoshInTheStock172() {
        #expect(DemoFlight.departure == "KMSN")
        #expect(DemoFlight.destination == "KOSH")
        #expect(DemoFlight.stops.isEmpty)
        #expect(DemoFlight.airplane == "c172")
    }

    @MainActor
    @Test func theDemoFlightSetsTheAirplaneAndAsksForTheRoute() {
        let plan = Plan()
        plan.tail = "N3429J"
        plan.altitudeChoice = "fastest"
        let command = DemoFlight.fly(plan)
        #expect(plan.aircraft == "c172")
        #expect(plan.tail == nil)
        #expect(plan.airplaneChosen)
        #expect(plan.altitudeChoice == nil)
        #expect(command == .planRoute(dep: "KMSN", stops: [], dest: "KOSH"))
    }
}
