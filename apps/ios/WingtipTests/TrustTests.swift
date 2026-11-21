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

    @Test func reportsGoUntilThePilotTurnsHelpImproveOff() throws {
        let defaults = try #require(UserDefaults(suiteName: "TrustTests.helpImprove"))
        defaults.removePersistentDomain(forName: "TrustTests.helpImprove")
        #expect(HelpImprove.allows(defaults))
        defaults.set(false, forKey: HelpImprove.key)
        #expect(!HelpImprove.allows(defaults))
        defaults.removePersistentDomain(forName: "TrustTests.helpImprove")
    }

    // MARK: About

    @Test func theVersionIsWrittenAsSettingsWritesIt() {
        let version = AppVersion(info: ["CFBundleShortVersionString": "1.2", "CFBundleVersion": "34"])
        #expect(version.short == "1.2")
        #expect(version.build == "34")
        #expect(version.text == "1.2 (34)")
        #expect(AppVersion(info: nil).text == "unknown (unknown)")
        // Sent as it is: the gateway cleans it to its characters and cuts it
        // to 40 (DiagnosticsController, the one home of the report's rules).
        #expect(AppVersion(short: "1.0β", build: "2").text == "1.0β (2)")
    }

    @Test func theCreditsAreTheIPhonesShareOfTheList() {
        #expect(AboutCredits.data.count == 24)
        #expect(AboutCredits.data.first?.what == "FAA aeronautical charts: sectional, terminal area and IFR enroute")
        #expect(AboutCredits.software.map(\.what) == ["Apple MapKit"])
        #expect(Wording.planningAid.hasPrefix("Wingtip Maps is a planning aid for VFR and IFR flight."))
        #expect(Wording.planningAid.hasSuffix("applicable regulations (14 CFR 91.103)."))
    }

    /// The open-source licences the app ships with: LicensePlist's
    /// acknowledgements in the app's Settings.bundle (scripts/build/licences.sh
    /// ios), which About opens, the engine's crates and Apple's NOTICE files
    /// among them.
    @Test func theAcknowledgementsShipInTheSettingsBundle() throws {
        let bundle = try #require(Bundle.main.url(forResource: "Settings", withExtension: "bundle"))
        let list = try #require(NSDictionary(contentsOf: bundle.appending(path: "com.mono0926.LicensePlist.plist")))
        let titles = (list["PreferenceSpecifiers"] as? [[String: Any]] ?? []).compactMap { $0["Title"] as? String }
        for name in ["Nuke", "Valet", "swift-openapi-runtime", "swift-openapi-runtime NOTICE", "Wingtip engine (Rust crates)"] {
            #expect(titles.contains(name), "\(name) is not in the acknowledgements")
        }
        let root = try #require(NSDictionary(contentsOf: bundle.appending(path: "Root.plist")))
        let panes = (root["PreferenceSpecifiers"] as? [[String: Any]] ?? []).compactMap { $0["File"] as? String }
        #expect(panes == ["com.mono0926.LicensePlist"])
    }

    /// A Commons photo's credit in the viewer is a link to its page, where
    /// its author and licence are given in full, as its licence asks.
    @Test func aPhotosCreditLinksToItsPage() {
        let page = URL(string: "https://commons.wikimedia.org/wiki/File:X.jpg")
        let shown = ShownPicture.paths("KOSH from the ground", ["https://upload.wikimedia.org/x.jpg"], credit: "Jane Doe · CC BY-SA 4.0", creditLink: page)
        #expect(shown.credit == "Jane Doe · CC BY-SA 4.0")
        #expect(shown.creditLink == page)
        #expect(ShownPicture.paths("KOSH airport diagram", ["/x.png"], credit: "FAA").creditLink == nil)
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
