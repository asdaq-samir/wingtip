import SwiftUI

/// A field's weather as Apple's Weather lays a place out
/// (docs/design/ios.md §7): the takeaway first -- the flight category word
/// in its colour with the wind and the report's age, which always shows
/// -- then the TAF's periods sideways as Weather's hourly forecast, then
/// modules in a two-column grid of rounded cards (one column at the
/// accessibility sizes), then the reports as sent, selectable. Every
/// figure is the report's or the engine's; the density altitude is the
/// engine's pressure_altitude_ft, density_ratio and density_altitude_ft
/// chain (ICAO Doc 7488), never worked out here.
struct FieldWeatherSection: View {
    let place: AirportPlace
    let metar: APIMetar

    var body: some View {
        Section {
            FieldWeatherHead(metar: metar)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: WingtipSpace.sm, leading: WingtipSpace.lg, bottom: WingtipSpace.sm, trailing: WingtipSpace.lg))
        }
        if let taf = place.taf, !taf.isEmpty {
            Section("Forecast") {
                TafStrip(taf: taf).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }
        }
        Section {
            WeatherModules(place: place, metar: metar)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
        }
        Section("As Sent") {
            if let raw = metar.raw { Text(raw).font(.footnote.monospaced()).textSelection(.enabled) }
            if let taf = place.taf, !taf.isEmpty { Text(taf).font(.footnote.monospaced()).textSelection(.enabled) }
        }
    }
}

/// The takeaway: the category in its colour and word (never colour
/// alone), then the wind and when it was reported, with its age.
struct FieldWeatherHead: View {
    let metar: APIMetar

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            if let category = metar.flightCategory {
                Text(category)
                    .font(WingtipType.card)
                    .foregroundStyle(Color(uiColor: FlightCategory.words(category)))
                    .accessibilityLabel(SpokenFigures.flightCategory(category))
            }
            let wind = metar.windSpeedKt != nil
                ? "Wind " + AirportWords.windLine(dirTrueDeg: metar.windDirTrueDeg, speedKt: metar.windSpeedKt, gustKt: metar.windGustKt) : nil
            let line = [wind, metar.observedAt.flatMap { AirportWords.observed($0) }].compactMap { $0 }.joined(separator: " · ")
            if !line.isEmpty { Text(line).font(.subheadline).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The TAF's periods side by side, as Weather's hourly forecast scrolls:
/// the report cut into its own change groups (FM, BECMG, TEMPO, PROB, as
/// the TAF writes them), each kept word for word.
struct TafStrip: View {
    let taf: String
    @ScaledMetric(relativeTo: .footnote) private var width = 180.0

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: WingtipSpace.sm) {
                ForEach(Array(Self.periods(taf).enumerated()), id: \.offset) { _, period in
                    Text(period)
                        .font(.footnote.monospaced())
                        .frame(width: width, alignment: .topLeading)
                        .padding(WingtipSpace.md)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                }
            }
            .scrollTargetLayout()
            .padding(.horizontal, WingtipSpace.lg)
        }
        .scrollTargetBehavior(.viewAligned)
    }

    /// The report split before each change group, words untouched.
    static func periods(_ taf: String) -> [String] {
        let words = taf.split(whereSeparator: \.isWhitespace).map(String.init)
        var periods: [[String]] = [[]]
        for word in words {
            let starts = word.hasPrefix("FM") && word.count >= 8 && word.dropFirst(2).allSatisfy(\.isNumber)
                || word == "BECMG" || word == "TEMPO" || (word.hasPrefix("PROB") && word.count == 6)
            if starts, !(periods.last ?? []).isEmpty { periods.append([]) }
            periods[periods.count - 1].append(word)
        }
        return periods.filter { !$0.isEmpty }.map { $0.joined(separator: " ") }
    }
}

/// The modules: Wind, Visibility, Ceiling, Altimeter, Temperature and
/// Density Altitude, each a title, a large figure and one line.
struct WeatherModules: View {
    let place: AirportPlace
    let metar: APIMetar
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: WingtipSpace.sm, alignment: .top), count: size.isAccessibilitySize ? 1 : 2)
        LazyVGrid(columns: columns, spacing: WingtipSpace.sm) {
            if metar.windSpeedKt != nil {
                module("Wind", "wind", AirportWords.windLine(dirTrueDeg: metar.windDirTrueDeg, speedKt: metar.windSpeedKt, gustKt: metar.windGustKt),
                       line: "From true north, as reported")
            }
            module("Visibility", "eye", AirportWords.miles(metar.visibilitySm, plus: metar.visibilityPlus) ?? "—", line: nil,
                   spoken: metar.visibilitySm.map { SpokenFigures.statuteMiles($0) + (metar.visibilityPlus == true ? " or more" : "") })
            module("Ceiling", "cloud", metar.ceilingFt.map { Format.altitude($0) } ?? "None", line: metar.ceilingFt == nil ? "No broken or overcast layer" : "Above the field",
                   spoken: metar.ceilingFt.map(SpokenFigures.feet))
            if let altimeter = metar.altimeterInHg {
                // Read as set on the altimeter: "two niner niner two".
                module("Altimeter", "gauge.with.dots.needle.33percent", "\(Format.number(altimeter, decimals: 2))", line: "inHg",
                       spoken: "\(SpokenFigures.digits(Format.number(altimeter, decimals: 2))) inches")
            }
            if let temp = metar.tempC {
                module("Temperature", "thermometer.medium", "\(Int(temp.rounded())) °C", line: metar.dewpointC.map { "Dew point \(Int($0.rounded())) °C" },
                       spoken: "\(SpokenFigures.number(temp)) degrees Celsius")
            }
            switch FieldDensity.altitudeFt(elevationFt: place.elevationFt, altimeterInHg: metar.altimeterInHg, tempC: metar.tempC) {
            case .success(let density)?:
                module("Density Altitude", "arrow.up.and.down", Format.altitude(density), line: "The engine's, at this report",
                       spoken: SpokenFigures.feet(density))
            case .failure(let error)?:
                // Said in its module, never left out as if the report lacked it.
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    Label("Density Altitude", systemImage: "arrow.up.and.down").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                    ProblemLine(Result<Void, any Error>.failure(error), "The density altitude")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case nil: EmptyView()
            }
        }
        .padding(.horizontal, WingtipSpace.lg)
    }

    private func module(_ title: String, _ symbol: String, _ value: String, line: String?, spoken: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Label(title, systemImage: symbol).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.title2.weight(.semibold).monospacedDigit())
            if let line { Text(line).font(.footnote).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(WingtipSpace.md)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title): \(spoken ?? value)" + (line.map { ", \($0)" } ?? ""))
    }
}
