import SwiftUI

/// A problem said where it happened, as the web app's lib/problems says
/// it: the call's own words in the tokens' problem ink at the note's size
/// under what failed, a mark beside them for a pilot who does not see the
/// red, and nothing at all without one. The app's one error style (the UI
/// audit of 2026-11-09, item 10, found orange text on one screen and red
/// on another).
struct ProblemLine: View {
    let problem: String?

    init(_ problem: String?) { self.problem = problem }

    /// The failure of something the screen worked out (an engine rule's
    /// Result), said with what it was for; nothing for a success.
    init<T>(_ result: Result<T, any Error>, _ what: String) {
        if case .failure(let error) = result { problem = "\(what) couldn't be worked out: \(error.localizedDescription)" } else { problem = nil }
    }

    var body: some View {
        if let problem {
            Label(problem, systemImage: "exclamationmark.circle.fill")
                .font(WingtipType.note)
                .foregroundStyle(WingtipInk.problem)
        }
    }
}

#Preview("ProblemLine") {
    List { ProblemLine("The planner could not be reached.") }
}
