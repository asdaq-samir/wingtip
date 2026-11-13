import SwiftUI

/// The loop's bar over the map, in the banners' column, only while a loop
/// is on: play or pause, the scrubber -- a time scrubber is the one place
/// a slider is right, the owner's rule for discrete settings aside -- and
/// the frame's time in Zulu and on this phone's clock, with its age, said
/// plainly as old once past the source's own pace. Fetching and failing
/// are said here too, where the loop is. Pauses the loop while the app is
/// in the background.
struct WeatherLoopBar: View {
    @Environment(WeatherLoop.self) private var loop
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        if loop.kind != .off {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                bar(now: context.date)
            }
            .onChange(of: scenePhase) { _, phase in loop.away(phase != .active) }
        }
    }

    private func bar(now: Date) -> some View {
        HStack(spacing: WingtipSpace.sm) {
            Button {
                loop.toggle()
            } label: {
                Image(systemName: loop.playing ? "pause.fill" : "play.fill")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .disabled(loop.frames.count < 2)
            .accessibilityLabel(loop.playing ? "Pause" : "Play")
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                if let status {
                    Text(status).font(.footnote).foregroundStyle(loop.failed ? WingtipInk.problem : Color.primary)
                } else {
                    Slider(
                        value: Binding(get: { Double(max(0, loop.shown)) }, set: { loop.seek(Int($0.rounded())) }),
                        in: 0...Double(max(1, loop.frames.count - 1)), step: 1)
                        .disabled(!loop.ready)
                        .accessibilityLabel("\(loop.kind.label) frame")
                    if let frame = loop.frame, let time = WeatherLoop.time(of: frame, now: now, oldAfterS: loop.oldAfterS) {
                        HStack(spacing: WingtipSpace.xs) {
                            Text(time.zulu).fontWeight(.semibold)
                            Text(time.local).foregroundStyle(.secondary).lineLimit(1)
                            Spacer(minLength: 0)
                            Text(time.old ? "Old: \(time.age)" : time.age)
                                .fontWeight(time.old ? .semibold : .regular)
                                .foregroundStyle(time.old ? WingtipInk.problem : Color.secondary)
                        }
                        .font(.caption)
                        .monospacedDigit()
                    }
                    KeptAgeLine(kind: .weatherLoop, key: loop.kind.rawValue)
                }
            }
        }
        .padding(.leading, WingtipSpace.xs).padding(.trailing, WingtipSpace.md).padding(.vertical, WingtipSpace.xs)
        .frame(maxWidth: 380)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.banner))
        .padding(.horizontal, WingtipSpace.md)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(loop.kind.label) loop")
    }

    private var status: String? {
        if loop.failed { return "\(loop.kind.label) isn't available right now" }
        if loop.frames.isEmpty { return "Fetching \(loop.kind.label.lowercased())…" }
        return nil
    }
}

/// The loop's two menus in Setup's Map section: which loop, and, with one
/// on, how fast it plays. Menus, as discrete settings are here.
struct WeatherLoopRows: View {
    @Environment(WeatherLoop.self) private var loop

    var body: some View {
        Picker("Radar and Satellite", selection: Bindable(loop).kind) {
            ForEach(LoopKind.allCases) { Text($0.label).tag($0) }
        }
        .pickerStyle(.menu)
        if loop.kind != .off {
            Picker("Loop Speed", selection: Bindable(loop).speed) {
                ForEach(LoopSpeed.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.menu)
        }
    }
}
