package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.assistant.model.AssistantChangesWords;
import app.wingtipmaps.gateway.assistant.model.AssistantSentence;
import app.wingtipmaps.gateway.assistant.model.AssistantSource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.util.RawValue;

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
 * and no request reaches Anthropic.
 */
@Component
public class ChangeLines {

    /** What the answer says wrote it, where a model's name would be. */
    static final String WRITER = "planner";

    /** The flight itself, which the planner puts first for a sentence to
     *  rest on: not a change. */
    private static final String FLIGHT = "flight:route";

    private static final Duration TIMEOUT = Duration.ofSeconds(60);

    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private final String plannerBaseUrl;

    public ChangeLines(@Value("${planner-service.base-url:http://planner:8000}") String plannerBaseUrl) {
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
    }

    /**
     * What changed between two briefings, as the planner lines it up.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached,
     *     refuses, or answers something that is not its answer
     */
    public AssistantChangesWords changes(String dep, String dest, List<String> stops, String then, String now) {
        ObjectNode body = PlannerClient.JSON.createObjectNode();
        body.put("dep", dep);
        body.put("dest", dest);
        ArrayNode stopNodes = body.putArray("stops");
        for (String stop : stops == null ? List.<String>of() : stops) {
            stopNodes.add(stop);
        }
        body.putRawValue("then", new RawValue(then));
        body.putRawValue("now", new RawValue(now));
        HttpRequest request = HttpRequest.newBuilder(URI.create(plannerBaseUrl + "/api/words/changes/sources"))
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(TIMEOUT)
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (java.io.IOException failed) {
            throw new PlannerUnavailableException("the planner could not be reached for the changes", failed);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new PlannerUnavailableException("interrupted asking the planner for the changes", interrupted);
        }
        if (response.statusCode() != 200) {
            throw new PlannerUnavailableException("the planner answered " + response.statusCode() + " to the changes");
        }
        try {
            return lines(PlannerClient.JSON.readTree(response.body()));
        } catch (JacksonException notItsAnswer) {
            throw new PlannerUnavailableException("the planner's changes were not its answer", notItsAnswer);
        }
    }

    /** The planner's WordsSources as the assistant's ChangesWords: a
     *  sentence a change, its heading, citing it. */
    static AssistantChangesWords lines(JsonNode found) {
        List<AssistantSource> sources = new ArrayList<>();
        List<AssistantSentence> sentences = new ArrayList<>();
        for (JsonNode source : found.path("sources")) {
            String id = source.path("id").asString();
            String label = source.path("label").asString();
            sources.add(new AssistantSource()
                    .id(id)
                    .label(label)
                    .text(source.path("text").asString()));
            if (!FLIGHT.equals(id)) {
                sentences.add(new AssistantSentence().text(label + ".").sources(List.of(id)));
            }
        }
        return new AssistantChangesWords()
                .changed(!sentences.isEmpty())
                .sentences(sentences)
                .sources(sentences.isEmpty() ? List.of() : sources)
                .model(WRITER);
    }
}
