import Testing
@testable import Wingtip

/// Send Feedback's text: the build and the system, and the tester's three
/// questions; nothing else of theirs (docs/store/beta.md).
struct AboutFeedbackTests {
    @Test func itCarriesTheBuildTheSystemAndTheQuestionsOnly() {
        let text = AboutModel.feedback(version: AppVersion(short: "1.0", build: "42"), system: "iOS 27.2")
        #expect(text.hasPrefix("Wingtip Maps 1.0 (42), iOS 27.2\n"))
        #expect(text.contains("What I was doing:") && text.contains("What happened:") && text.contains("What I expected:"))
        #expect(text.split(separator: "\n").count == 4)
    }
}
