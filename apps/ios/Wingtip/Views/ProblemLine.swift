import SwiftUI

/// A problem said where it happened, as the web app's lib/problems says
/// it: the call's own words in red at the footnote's size under what
/// failed, and nothing at all without one.
struct ProblemLine: View {
    let problem: String?

    init(_ problem: String?) { self.problem = problem }

    /// The failure of something the screen worked out (an engine rule's
    /// Result), said with what it was for; nothing for a success.
    init<T>(_ result: Result<T, any Error>, _ what: String) {
        if case .failure(let error) = result { problem = "\(what) couldn't be worked out: \(error.localizedDescription)" } else { problem = nil }
    }

    var body: some View {
        if let problem { Text(problem).foregroundStyle(.red).font(.footnote) }
    }
}

#Preview("ProblemLine") {
    List { ProblemLine("The planner could not be reached.") }
}
