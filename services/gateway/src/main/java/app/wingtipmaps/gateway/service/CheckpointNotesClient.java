package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.planner.model.PlannerCheckpointNote;
import app.wingtipmaps.gateway.planner.model.PlannerPilotNotes;
import app.wingtipmaps.gateway.tracing.TraceHeaders;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;

/**
 * The checkpoint notes a pilot wrote for themselves, which the planner
 * keeps (services/planner app.routers.notes, GET
 * /api/checkpoint-notes/mine), read for their export: the one record of
 * theirs this app does not hold. The planner's route is internal (no
 * x-gateway mark), so a browser cannot ask it; this app names the pilot
 * by the header the planner reads, as AccountService does to delete them.
 * Pinned to HTTP/1.1, as PlannerClient is, for the same uvicorn reason.
 */
@Component
public class CheckpointNotesClient {

    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final String plannerBaseUrl;
    private TraceHeaders traceHeaders = TraceHeaders.NONE;

    public CheckpointNotesClient(@Value("${planner-service.base-url:http://planner:8000}") String plannerBaseUrl) {
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
    }

    @Autowired(required = false)
    void setTraceHeaders(TraceHeaders traceHeaders) {
        this.traceHeaders = traceHeaders;
    }

    /**
     * The pilot's own notes, oldest first.
     *
     * @throws PlannerUnavailableException when the planner cannot be asked or answers otherwise
     */
    public List<PlannerCheckpointNote> mine(Pilot pilot) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(plannerBaseUrl + "/api/checkpoint-notes/mine"))
                .GET()
                .header(AccountService.PILOT_HEADER, String.valueOf(pilot.getId()))
                .timeout(Duration.ofSeconds(15))
                .build();
        try {
            HttpResponse<String> response = http.send(
                    traceHeaders.traced(request), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                throw new PlannerUnavailableException("the planner answered " + response.statusCode() + " to the notes");
            }
            List<PlannerCheckpointNote> notes =
                    PlannerClient.JSON.readValue(response.body(), PlannerPilotNotes.class).getNotes();
            return notes == null ? List.of() : notes;
        } catch (JacksonException notItsAnswer) {
            throw new PlannerUnavailableException("the planner's answer to the notes was not its answer", notItsAnswer);
        } catch (IOException failed) {
            throw new PlannerUnavailableException("the planner could not be reached for the notes", failed);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new PlannerUnavailableException("interrupted asking the planner for the notes", interrupted);
        }
    }
}
