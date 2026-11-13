package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.dto.BriefingChangeDto;
import app.wingtipmaps.gateway.dto.BriefingSourceDto;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSource;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * What changed in a watched flight's briefing, in the planner's own lines.
 *
 * <p>The planner finds the changes (POST /api/words/changes/sources,
 * routers/words.py briefing_changes: a field's flight category, a SIGMET
 * or AIRMET new or gone, a TFR new, a field newly below VFR, a TAF
 * crossing a category line). Each change's own heading ("KDLH METAR, VFR
 * to IFR") is the sentence, citing that change, and its raw reports go
 * with it, so the email and the app say what changed and what it was read
 * from. Asked through {@link PlannerClient}, its answer the planner's
 * generated WordsSources.
 */
@Component
public class ChangeLines {

    /**
     * What changed, as the flight watch keeps it with the watch (its
     * changes_json) and shows it: whether anything did, a sentence a
     * change, and the reports they cite. Rows kept before Claude was taken
     * out (docs/decisions/0041) carry a model's name and an unavailable
     * reason as well, which are read past.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Changes(boolean changed, List<BriefingChangeDto> sentences, List<BriefingSourceDto> sources) {}

    /** The flight itself, which the planner puts first for a sentence to
     *  rest on: not a change. */
    private static final String FLIGHT = "flight:route";

    private final PlannerClient planner;

    public ChangeLines(PlannerClient planner) {
        this.planner = planner;
    }

    /**
     * What changed between two briefings, as the planner lines it up.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached,
     *     refuses, or answers something that is not its answer
     */
    public Changes changes(String dep, String dest, List<String> stops, String then, String now) {
        return lines(planner.changeSources(dep, dest, stops, then, now));
    }

    /** The planner's WordsSources as the watch's changes: a sentence a
     *  change, its heading, citing it. */
    static Changes lines(PlannerWordsSources found) {
        List<BriefingSourceDto> sources = new ArrayList<>();
        List<BriefingChangeDto> sentences = new ArrayList<>();
        for (PlannerWordsSource source : found.getSources()) {
            sources.add(new BriefingSourceDto(source.getId(), source.getLabel(), source.getText()));
            if (!FLIGHT.equals(source.getId())) {
                sentences.add(new BriefingChangeDto(source.getLabel() + ".", List.of(source.getId())));
            }
        }
        return new Changes(!sentences.isEmpty(), sentences, sentences.isEmpty() ? List.of() : sources);
    }
}
