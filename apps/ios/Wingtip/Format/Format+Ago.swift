import Foundation

extension Format {
    /// How long ago something was: "just now" under a minute, "23m ago",
    /// "2h 5m ago", "3d ago" -- the engine's `time_ago`, the one rule the
    /// web and Android write it by too (timeAgo.json). It was four writers
    /// here with their own steps ("14 min ago", "2 h 5 min ago"). Nil only
    /// where the engine refuses, logged by Engine.rule. Here and not in
    /// Format.swift, which the widgets compile without the engine.
    static func ago(_ seconds: TimeInterval) -> String? {
        try? Engine.timeAgo(seconds: seconds)
    }

    /// How long ago `at` was, at `now`.
    static func ago(_ at: Date, now: Date = Date()) -> String? {
        ago(now.timeIntervalSince(at))
    }
}
