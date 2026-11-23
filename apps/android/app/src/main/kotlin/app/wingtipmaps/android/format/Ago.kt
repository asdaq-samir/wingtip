package app.wingtipmaps.android.format

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.timeAgo

/**
 * How long ago something was: "just now" under a minute, "23m ago",
 * "2h 5m ago", "3d ago" -- the engine's `time_ago`, the one rule the web
 * and the iPhone write it by too (timeAgo.json). It was two writers here
 * with their own steps ("5 min ago", "3 h ago", "2 days ago"). Empty only
 * where the engine refuses.
 */
fun Format.ago(seconds: Double): String = Engine.timeAgo(seconds = seconds).getOrNull() ?: ""
