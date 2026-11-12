package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.assistant.model.AssistantChangesWords;
import app.wingtipmaps.gateway.assistant.model.AssistantSentence;
import app.wingtipmaps.gateway.assistant.model.AssistantSource;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSource;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * What changed in a watched flight's briefing, in the planner's own lines
 * rather than Claude's words: the flight watch's answer while the Claude
 * features are off (app.claude-features, the owner's decision of
 * 2026-11-10, docs/decisions/0035).
 *
 * <p>The planner finds the changes either way (POST
 * /api/words/changes/sources, routers/words.py briefing_changes: a field's
 * flight category, a SIGMET or AIRMET new or gone, a TFR new, a field newly
 * below VFR, a TAF crossing a category line). The assistant only puts them
 * into sentences; here each change's own heading ("KDLH METAR, VFR to IFR")
 * is the sentence, citing that change, and its raw reports go with it, so
 * the email and the app read the same as with the words, minus the prose,
 * and no request reaches Anthropic. Asked through {@link PlannerClient}, its
 * answer the planner's generated WordsSources.
 */
@Component
public class ChangeLines {

    /** What the answer says wrote it, where a model's name would be. */
    static final String WRITER = "planner";

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
    public AssistantChangesWords changes(String dep, String dest, List<String> stops, String then, String now) {
        String ask = PlannerClient.changesAsk(dep, dest, stops, then, now);
        return lines(planner.postJson("/api/words/changes/sources", ask, PlannerWordsSources.class, "the changes"));
    }

    /** The planner's WordsSources as the assistant's ChangesWords: a
     *  sentence a change, its heading, citing it. */
    static AssistantChangesWords lines(PlannerWordsSources found) {
        List<AssistantSource> sources = new ArrayList<>();
        List<AssistantSentence> sentences = new ArrayList<>();
        for (PlannerWordsSource source : found.getSources()) {
            sources.add(new AssistantSource()
                    .id(source.getId())
                    .label(source.getLabel())
                    .text(source.getText()));
            if (!FLIGHT.equals(source.getId())) {
                sentences.add(
                        new AssistantSentence().text(source.getLabel() + ".").sources(List.of(source.getId())));
            }
        }
        return new AssistantChangesWords()
                .changed(!sentences.isEmpty())
                .sentences(sentences)
                .sources(sentences.isEmpty() ? List.of() : sources)
                .model(WRITER);
    }
}
