import Foundation
import Testing
@testable import Wingtip

/// What the App Store reads of the app: the privacy manifest bundled with
/// it, against docs/privacy-inventory.md's list (the store audit's P3, B1
/// and B2: App Store Connect refuses an upload whose required-reason APIs
/// are not declared, ITMS-91053).
@MainActor
struct StorePrivacyTests {
    private func manifest() throws -> [String: Any] {
        let url = try #require(Bundle(for: Plan.self).url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        return try #require(try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
    }

    @Test func theManifestDeclaresWhatTheAppCollects() throws {
        let types = try #require(try manifest()["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let linked = Dictionary(types.map { ($0["NSPrivacyCollectedDataType"] as? String ?? "", $0["NSPrivacyCollectedDataTypeLinked"] as? Bool ?? false) },
                                uniquingKeysWith: { $0 || $1 })
        for kind in ["EmailAddress", "Name", "PhoneNumber", "UserID", "OtherUserContent", "PreciseLocation"] {
            #expect(linked["NSPrivacyCollectedDataType\(kind)"] == true, "\(kind) declared, linked")
        }
        #expect(linked["NSPrivacyCollectedDataTypeCrashData"] == false)
        #expect(linked["NSPrivacyCollectedDataTypePerformanceData"] == false)
        #expect(try manifest()["NSPrivacyTracking"] as? Bool == false)
    }

    @Test func theManifestGivesEachRequiredReasonAPIItsReason() throws {
        let apis = try #require(try manifest()["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        let reasons = Dictionary(apis.map { ($0["NSPrivacyAccessedAPIType"] as? String ?? "", Set($0["NSPrivacyAccessedAPITypeReasons"] as? [String] ?? [])) },
                                 uniquingKeysWith: { $0.union($1) })
        // The app's own defaults and the App Group the widgets read.
        #expect(reasons["NSPrivacyAccessedAPICategoryUserDefaults"] == ["CA92.1", "1C8F.1"])
        // Downloads shows the free space on the iPhone.
        #expect(reasons["NSPrivacyAccessedAPICategoryDiskSpace"] == ["85F4.1"])
        #expect(reasons["NSPrivacyAccessedAPICategoryFileTimestamp"] == ["C617.1"])
    }

    // MARK: Signing out and deleting the account (the store audit's P7)

    @Test func forgettingTheDeviceDeletesThePathTheTrackAndTheCache() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "recorder-\(UUID().uuidString).json")
        try Data(#"{"points":[{"t":1,"lat":42,"lon":-88}],"flown":true}"#.utf8).write(to: file)
        let recorder = FlightRecorder(file: file)
        #expect(!recorder.points.isEmpty)
        try FileManager.default.createDirectory(at: OwnTrail.file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("[]".utf8).write(to: OwnTrail.file)
        let cache = URLCache(memoryCapacity: 1 << 20, diskCapacity: 0)
        let request = URLRequest(url: URL(string: "https://example.com/api/me")!)
        cache.storeCachedResponse(CachedURLResponse(response: URLResponse(url: request.url!, mimeType: "application/json", expectedContentLength: 2, textEncodingName: nil),
                                                    data: Data("{}".utf8)), for: request)
        #expect(cache.cachedResponse(for: request) != nil)

        Session.forgetDevice(recorder: recorder, cache: cache)

        #expect(recorder.points.isEmpty && !FileManager.default.fileExists(atPath: file.path))
        #expect(OwnTrail.shared.points.isEmpty && !FileManager.default.fileExists(atPath: OwnTrail.file.path))
        #expect(cache.cachedResponse(for: request) == nil)
    }

    @Test func forgettingTheCookiesEmptiesTheJar() throws {
        let jar = HTTPCookieStorage.sharedCookieStorage(forGroupContainerIdentifier: "test.\(UUID().uuidString)")
        jar.setCookie(HTTPCookie(properties: [.name: "SESSION", .value: "v", .domain: "wingtipmaps.app", .path: "/"])!)
        #expect(jar.cookies?.isEmpty == false)
        Session.forgetCookies(jar)
        #expect(jar.cookies?.isEmpty != false)
    }

    // MARK: The planning-aid notice (the store audit's S2)

    @Test func thePlanningAidNoticeIsShownOnceAndNotUnderTheTests() throws {
        let defaults = try #require(UserDefaults(suiteName: "notice-\(UUID().uuidString)"))
        // An app launched as a pilot launches it: no test host around it.
        let app: [String: String] = [:]
        #expect(PlanningAidNotice.wanted(defaults: defaults, arguments: [], environment: app))
        // The UI tests' and the store pictures' launches, as the first flight's.
        #expect(!PlanningAidNotice.wanted(defaults: defaults, arguments: ["-fresh"], environment: app))
        #expect(PlanningAidNotice.wanted(defaults: defaults, arguments: ["-fresh", "-planningAid"], environment: app))
        // The app hosting the unit tests shows no alert over their windows.
        #expect(!PlanningAidNotice.wanted(defaults: defaults, arguments: [], environment: ["XCTestConfigurationFilePath": "/x"]))
        defaults.set(true, forKey: PlanningAidNotice.acceptedKey)
        #expect(!PlanningAidNotice.wanted(defaults: defaults, arguments: [], environment: app))
        // The words are About's and the listing's.
        #expect(PlanningAidNotice.message.hasPrefix(PlanningAid.words))
        #expect(PlanningAidNotice.message.contains("Not for navigation"))
    }
}
