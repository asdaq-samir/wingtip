import SwiftUI

/// The model weather's menus in the Map card, beside the radar loop's: Off
/// or the field drawn, and, where it has levels, which (the web's
/// FlowSettingsRow and the legend's level menu). Menus, as discrete
/// settings are here.
struct ModelWeatherRows: View {
    @Environment(ModelWeather.self) private var model

    var body: some View {
        Picker("Model Weather", selection: Bindable(model).field) {
            ForEach(FlowFieldKind.allCases) { Text($0.label).tag($0) }
        }
        .pickerStyle(.menu)
        ModelWeatherLevelPicker()
    }
}

/// The level menu (Surface, FL030 ... FL300, Max), as AWC's own picker's
/// levels are a list; only where the field has more than one.
struct ModelWeatherLevelPicker: View {
    @Environment(ModelWeather.self) private var model

    var body: some View {
        let levels = FlowLevels.levels(model.layer, model.field)
        if model.field != .off, levels.count > 1, let shown = model.level {
            Picker(model.field == .wind ? "Wind Level" : "Level", selection: Binding(get: { shown }, set: { model.levelPick = $0 })) {
                ForEach(levels, id: \.self) { Text(FlowLevels.name($0)).tag($0) }
            }
            .pickerStyle(.menu)
        }
    }
}

/// The timeline, in the banners' column while the model weather is on, as
/// the radar loop's bar is: Play, which steps through the hours once; the
/// title, the hour's day on this phone's clock and its time in Zulu with
/// how far ahead; on the precipitation 1h | 12h, the hour past or the
/// forecast; and the hours on a slider, the one place a slider is right.
struct ModelWeatherBar: View {
    @Environment(ModelWeather.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        if model.field != .off {
            bar
                .onChange(of: scenePhase) { _, phase in model.away(phase != .active) }
        }
    }

    private var bar: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            HStack(spacing: WingtipSpace.sm) {
                Button {
                    model.toggle()
                } label: {
                    Image(systemName: model.playing ? "pause.fill" : "play.fill")
                        .frame(width: WingtipSize.tapTarget, height: WingtipSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .disabled(model.steps.count < 2)
                .accessibilityLabel(model.playing ? "Pause" : "Play")
                if let status {
                    Text(status).font(.footnote).foregroundStyle(model.failed ? WingtipInk.problem : Color.primary)
                    Spacer(minLength: 0)
                } else {
                    heading
                    Spacer(minLength: 0)
                    if model.field == .precip {
                        Picker("Precipitation span", selection: Bindable(model).span) {
                            ForEach(ModelWeather.Span.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .fixedSize()
                    }
                }
            }
            if status == nil, let first = model.steps.first, let last = model.steps.last, last > first {
                Slider(value: Binding(get: { Double(max(first, model.shown)) }, set: { model.seek(Int($0.rounded())) }),
                       in: Double(first)...Double(last), step: 1) {
                    Text("\(model.field.label) hour")
                } minimumValueLabel: {
                    Text(model.hourName(first)).font(.caption2).monospacedDigit()
                } maximumValueLabel: {
                    Text(model.hourName(last)).font(.caption2).monospacedDigit()
                }
                .accessibilityValue(model.hourName(model.shown))
            }
            // A tapped point whose value the engine could not say.
            ProblemLine(model.readingProblem)
        }
        .padding(.leading, WingtipSpace.xs).padding(.trailing, WingtipSpace.md).padding(.vertical, WingtipSpace.xs)
        .frame(maxWidth: 380)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.banner))
        .padding(.horizontal, WingtipSpace.md)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(model.field.label) timeline")
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.subheadline).fontWeight(.semibold).lineLimit(1)
            if let frame = model.frame, let at = ModelWeather.date(frame.valid) {
                Text(at.formatted(.dateTime.weekday(model.field == .precip ? .abbreviated : .wide).month(model.field == .precip ? .abbreviated : .wide).day()))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                HStack(spacing: 0) {
                    Text(Format.zulu(at)).foregroundStyle(.secondary)
                    if let ahead = ahead(frame) { Text(" · \(ahead)").fontWeight(.semibold).foregroundStyle(.tint) }
                }
                .font(.caption2).monospacedDigit().lineLimit(1)
            }
        }
    }

    /// The web's titleOf: "Wind Speed" over the wind; over the
    /// precipitation "Forecast", or for the hour past the radar's.
    private var title: String {
        switch model.field {
        case .wind: return "Wind Speed"
        case .precip:
            if model.span == .twelve { return "Forecast" }
            return model.frames.contains { $0.past && $0.radarTiles != nil } ? "Radar" : "Past hour"
        default: return model.field.label
        }
    }

    /// What the hour shown is: the radar's, observed; else a forecast, an
    /// hour to come said as how far ahead.
    private func ahead(_ frame: APIFlowFrame) -> String? {
        if model.radarTiles != nil { return "Observed" }
        return frame.past ? "Forecast" : "Forecast \(model.hourName(model.shown))"
    }

    private var status: String? {
        if model.failed { return "Model weather isn't available right now" }
        if model.layer == nil { return "Fetching model weather…" }
        if model.frames.isEmpty { return "No model weather yet" }
        return nil
    }
}

/// The legend at the map's top left while the model weather is on, as the
/// web's FlowLegend: Close, which turns it off; the field's menu and,
/// where it has them, its levels'; then a narrow card with the field and
/// its unit, the ramp as a slim bar with its marks (knots, degrees, or the
/// bands' words, the engine's), and whose the picture is ("AWC winds, 12Z").
struct ModelWeatherLegend: View {
    @Environment(ModelWeather.self) private var model

    var body: some View {
        if model.field != .off {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                HStack(spacing: WingtipSpace.sm) {
                    Button {
                        model.field = .off
                    } label: {
                        Image(systemName: "xmark").frame(width: WingtipSize.tapTarget, height: WingtipSize.tapTarget)
                    }
                    .accessibilityLabel("Turn off model weather")
                    .floatingGlass(in: Circle())
                    Menu {
                        Picker("Weather on the map", selection: Bindable(model).field) {
                            ForEach(FlowFieldKind.allCases.filter { $0 != .off }) { Text($0.label).tag($0) }
                        }
                        ModelWeatherLevelPicker()
                    } label: {
                        Text(model.level.map { "\(model.field.label), \(FlowLevels.name($0))" } ?? model.field.label)
                            .font(.subheadline).fontWeight(.semibold)
                            .padding(.horizontal, WingtipSpace.md).frame(minHeight: WingtipSize.tapTarget)
                    }
                    .floatingGlass(in: Capsule())
                }
                if let look = FlowLooks.look(model.field) { card(look) }
            }
            // At the left of the banners' column, under the timeline.
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, WingtipSpace.md)
        }
    }

    private func card(_ look: FieldLook) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            Text(look.title).font(.caption).fontWeight(.semibold)
            HStack(alignment: .top, spacing: WingtipSpace.sm) {
                LinearGradient(stops: Self.stops(look.bar), startPoint: .top, endPoint: .bottom)
                    .frame(width: WingtipSpace.xs).clipShape(Capsule())
                GeometryReader { box in
                    ForEach(look.ticks.indices, id: \.self) { i in
                        Text(look.ticks[i].label)
                            .font(.caption2).foregroundStyle(.secondary).monospacedDigit().fixedSize()
                            .position(x: box.size.width / 2, y: Self.place(look.bar, look.ticks[i].at) * box.size.height)
                    }
                }
            }
            .frame(height: 112)
            let source = sourceLine
            if !source.text.isEmpty {
                Text(source.text).font(.caption2).foregroundStyle(source.stale ? WingtipInk.caution : Color.secondary).lineLimit(2)
            }
        }
        .padding(WingtipSpace.md)
        .frame(width: 140, alignment: .leading)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.card))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(look.title) legend")
    }

    /// A tick's place down the bar, 0 at the top (the highest value).
    static func place(_ ramp: FlowRamp, _ at: Double) -> CGFloat {
        let span = ramp.span
        return CGFloat(min(1, max(0, (span.upperBound - at) / (span.upperBound - span.lowerBound))))
    }

    /// The bar's colours, top the highest, at least a quarter strong so
    /// its clear end still reads (the web's rampGradient).
    static func stops(_ ramp: FlowRamp) -> [Gradient.Stop] {
        ramp.stops.reversed().map { stop in
            let colour = Color(cgColor: CGColor(srgbRed: CGFloat(stop.red) / 255, green: CGFloat(stop.green) / 255, blue: CGFloat(stop.blue) / 255,
                                                alpha: CGFloat(max(stop.alpha, 64)) / 255))
            return Gradient.Stop(color: colour, location: place(ramp, stop.at))
        }
    }

    /// The web's sourceLine: whose the picture is and when its run was made.
    private var sourceLine: (text: String, stale: Bool) {
        if model.radarTiles != nil { return ("Radar, observed", false) }
        guard let source = model.frame?.sources?[model.file] else { return ("", false) }
        let when = source.issued.map { iso -> String in
            let hour = iso.dropFirst(11).prefix(2)
            return "\(hour)Z"
        }
        let name = source.fallback ? "\(source.label) in place of AWC" : source.label
        return ([name, when].compactMap { $0 }.joined(separator: ", "), source.stale)
    }
}
