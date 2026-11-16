import SwiftUI

/// Weather: the report first, its age first of all, each figure with its
/// glyph and the report as sent under them; for a field with no report,
/// the weather modelled at it and the nearest station's report.
struct AirportWeatherTab: View {
    @Environment(ClearanceListener.self) private var listener
    let place: AirportPlace
    /// The card's Refresh, asked from the tab's foot; none in a preview.
    var refresh: (() async -> Void)?
    @State private var refreshing = false

    var body: some View {
        if let metar = place.metar {
            // Weather's layout: the takeaway, the TAF's periods, the
            // modules and the reports as sent (FieldWeather).
            FieldWeatherSection(place: place, metar: metar)
        } else {
            Section {
                ReceiverReportRows(ident: place.ident, otherwise: place.weatherUnavailable == true ? "The weather service could not be reached" : "No weather station reports from this field")
            }
        }
        // The National Weather Service's Gridded LAMP at the field for the
        // hour (wingtip.glmp): planning guidance from a model, not a report.
        if place.metar == nil, let modelled = place.modelledWeather {
            Section("Modelled for \(AirportWords.date(modelled.validAt).map(Format.zulu) ?? modelled.validAt)") {
                figure("cloud.sun", "Flight category", modelled.flightCategory, spoken: SpokenFigures.flightCategory(modelled.flightCategory))
                // GLMP's most is 10 sm, as a METAR's "10SM" is.
                figure("eye", "Visibility", modelled.visibilitySm >= 10 ? "10+ sm" : "\(AirportWords.plain(modelled.visibilitySm)) sm",
                       spoken: modelled.visibilitySm >= 10 ? "ten statute miles or more" : SpokenFigures.statuteMiles(modelled.visibilitySm))
                figure("cloud", "Ceiling", modelled.ceilingFt.map { Format.altitude($0) } ?? "None", spoken: modelled.ceilingFt.map(SpokenFigures.feet))
            }
        }
        DigitalAtisSections()
        if listener.canListen { AtisSection() } // heard on the iPhone or not offered
        if place.metar == nil, let nearby = place.nearbyMetar {
            Section("Nearest Report, \(Format.distance(nearby.distanceNm, decimals: 0)) \(AirportWords.compassPoint(Double(nearby.bearingDeg)))") {
                CardRow(title: nearby.ident, detail: nearby.metar.observedAt.flatMap { AirportWords.observedSaid($0) }) {
                    if let category = nearby.metar.flightCategory {
                        Text(category).fontWeight(.semibold).accessibilityLabel(SpokenFigures.flightCategory(category))
                    }
                }
                if let raw = nearby.metar.raw { Text(raw).font(.footnote.monospaced()).textSelection(.enabled) }
            }
        }
        if let refresh {
            Section {
                Button(refreshing ? "Refreshing…" : "Refresh Weather", systemImage: "arrow.clockwise") {
                    refreshing = true
                    Task {
                        await refresh()
                        refreshing = false
                    }
                }
                .disabled(refreshing)
            }
        }
    }

    /// Listen to ATIS: one broadcast heard through the microphone
    /// (ClearanceListener.hearBroadcast, the radio's recognizer), read by the
    /// engine (Atis), and what matters at the hold-short line in one
    /// line -- the runway in use and the altimeter -- with the figures
    /// in a short table under it and the transcript folded away. A
    /// failure is said in the row (ProblemLine), not an alert.
    struct AtisSection: View {
        @Environment(ClearanceListener.self) private var listener
        @State private var listening = false
        @State private var heard = ""
        @State private var reading: Atis?
        @State private var problem: String?
        @State private var hearing: Task<Void, Never>?

        var body: some View {
            Section {
                Button {
                    if listening {
                        listener.stop()
                        return
                    }
                    listening = true
                    problem = nil
                    reading = nil
                    heard = ""
                    hearing = Task { @MainActor in
                        let text = await listener.hearBroadcast { heard = $0 }
                        listening = false
                        guard let text else {
                            problem = listener.problem ?? "Nothing could be heard."
                            return
                        }
                        guard !text.isEmpty else {
                            problem = "Nothing was heard. Tune the ATIS, hold the phone to the speaker and tap again."
                            return
                        }
                        let read: Atis
                        do { read = try Atis.read(text) } catch {
                            problem = "The broadcast could not be read: \(error.localizedDescription)"
                            return
                        }
                        reading = read
                        if !read.heardAny { problem = "Nothing of a broadcast was heard in that." }
                    }
                } label: {
                    CardRow(badge: RowBadge(systemImage: "dot.radiowaves.left.and.right", colour: Badge.weather),
                            title: listening ? "Listening to the radio…" : "Listen to ATIS",
                            detail: listening ? (heard.isEmpty ? "Tune the ATIS or AWOS and hold the phone to the speaker" : heard) : nil) {
                        if listening { ProgressView() }
                    }
                }
                .accessibilityLabel(listening ? "Stop listening" : "Listen to ATIS")
                ProblemLine(problem)
                if let reading, reading.heardAny {
                    CardRow(title: reading.glance) {
                        if let letter = reading.information { Text("Information \(letter)") }
                    }
                    ForEach(Array(reading.rows.enumerated()), id: \.offset) { _, row in
                        LabeledContent(row.label, value: row.value)
                    }
                }
                if let reading {
                    DisclosureGroup("Transcript") {
                        Text(reading.raw).font(.footnote.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                }
            }
            .onDisappear { hearing?.cancel(); if listening { listener.stop() } }
        }
    }

    /// One figure of the report; `spoken` is the figure as VoiceOver says
    /// it (SpokenFigures), where "29.92 inHg" would be read as letters.
    private func figure(_ symbol: String, _ title: String, _ value: String, spoken: String? = nil) -> some View {
        CardRow(badge: RowBadge(systemImage: symbol, colour: Badge.weather), title: title) {
            Text(value).fontWeight(.semibold).accessibilityLabel(spoken ?? value)
        }
    }
}
