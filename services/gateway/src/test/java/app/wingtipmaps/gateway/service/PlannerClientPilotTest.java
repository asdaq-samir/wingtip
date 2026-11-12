package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.upstream.Upstreams;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The gateway asks the planner for a pilot's currency and a student's
 *  61.109 experience (the engine works them out, tested there): the
 *  logbook goes as the planner's LogbookEntry, and its answer is read
 *  into the gateway's own records. */
class PlannerClientPilotTest {

    private HttpServer planner;
    private final List<JsonNode> asked = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String answer = "{}";
    /** How many of the next requests have their connection dropped unanswered. */
    private volatile int dropped = 0;

    @BeforeEach
    void startPlanner() throws IOException {
        planner = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        planner.createContext("/api/pilot/", exchange -> {
            asked.add(JsonMapper.shared().readTree(exchange.getRequestBody()));
            if (dropped > 0) {
                dropped--;
                exchange.close();
                return;
            }
            byte[] body = answer.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        planner.start();
    }

    @AfterEach
    void stopPlanner() {
        planner.stop(0);
    }

    private PlannerClient client() {
        // The rules are the planner's; the assistant is not asked here.
        return Upstreams.plannerClient(
                "http://127.0.0.1:" + planner.getAddress().getPort(), "http://127.0.0.1:1");
    }

    private static List<LogbookEntry> logbook() {
        Pilot pilot = new Pilot("pilot@example.com", "A. Pilot", "sub-1");
        return List.of(new LogbookEntry(pilot)
                .set(LocalDate.of(2026, 9, 20), "N12345", "C172", null, 1.5, 0, 0, 3, 1, null)
                .instrument(6, true, false));
    }

    /** A connection the planner closed while it sat in the pool (uvicorn
     *  keeps one 5 s) is asked again once, not reported unreachable; two
     *  in a row are. */
    @Test
    void aRuleAskedOnAClosedConnectionIsAskedAgainOnce() {
        answer = "[]";
        dropped = 1;
        assertThat(client().experience(logbook(), LocalDate.of(2026, 10, 11))).isEmpty();
        assertThat(asked).hasSize(2);
        dropped = 2;
        assertThatThrownBy(() -> client().experience(logbook(), LocalDate.of(2026, 10, 11)))
                .isInstanceOf(PlannerUnavailableException.class)
                .hasMessageContaining("could not be reached");
    }

    @Test
    void theCurrencyGoesAsTheLogbookAndComesBackAsCurrencyDto() {
        answer = """
                {"dayPassengersUntil": "2026-12-19", "nightPassengersUntil": null, "flightReviewOn": "2025-06-14",
                 "flightReviewUntil": "2027-06-30", "medicalExpiresOn": null, "totalHours": 1.5, "nightHours": 0.0,
                 "crossCountryHours": 0.0, "landings": 4, "flights": 1, "instrumentCurrentUntil": null, "ipcOn": null,
                 "ipcNeededAfter": null, "approachesInWindow": 6, "holdingInWindow": true, "trackingInWindow": false}
                """;
        CurrencyDto c = client().currency(logbook(), LocalDate.of(2025, 6, 14), null, null, LocalDate.of(2026, 10, 11));
        assertThat(c.dayPassengersUntil()).isEqualTo(LocalDate.of(2026, 12, 19));
        assertThat(c.flightReviewUntil()).isEqualTo(LocalDate.of(2027, 6, 30));
        assertThat(c.landings()).isEqualTo(4);
        assertThat(c.holdingInWindow()).isTrue();

        JsonNode sent = asked.get(0);
        assertThat(sent.get("today").asString()).isEqualTo("2026-10-11");
        assertThat(sent.get("flightReviewOn").asString()).isEqualTo("2025-06-14");
        assertThat(sent.get("medicalExpiresOn").isNull()).isTrue();
        JsonNode entry = sent.get("entries").get(0);
        assertThat(entry.get("flownOn").asString()).isEqualTo("2026-09-20");
        assertThat(entry.get("dayLandings").asInt()).isEqualTo(3);
        assertThat(entry.get("nightLandings").asInt()).isEqualTo(1);
        assertThat(entry.get("approaches").asInt()).isEqualTo(6);
        assertThat(entry.get("holding").asBoolean()).isTrue();
    }

    @Test
    void theExperienceComesBackItemByItem() {
        answer = """
                [{"key": "total", "rule": "61.109(a)", "label": "Flight time", "have": 1.5, "need": 40.0, "unit": "h", "met": false}]
                """;
        List<ExperienceItemDto> items = client().experience(logbook(), LocalDate.of(2026, 10, 15));
        assertThat(items).singleElement().satisfies(i -> {
            assertThat(i.rule()).isEqualTo("61.109(a)");
            assertThat(i.have()).isEqualTo(1.5);
            assertThat(i.met()).isFalse();
        });
        assertThat(asked.get(0).get("today").asString()).isEqualTo("2026-10-15");
    }

    /** The generated types read a field left out as null; one the planner
     *  always sends is then not its answer, rather than a 0 or a crash. */
    @Test
    void anAnswerMissingAFieldItAlwaysSendsIsUnavailable() {
        answer = """
                [{"key": "total", "rule": "61.109(a)", "label": "Flight time", "need": 40.0, "unit": "h", "met": false}]
                """;
        assertThatThrownBy(() -> client().experience(logbook(), LocalDate.of(2026, 10, 15)))
                .isInstanceOf(PlannerUnavailableException.class)
                .hasMessageContaining("was not its answer");
    }

    @Test
    void aPlannerThatRefusesIsUnavailable() {
        status = 422;
        assertThatThrownBy(() -> client().experience(logbook(), LocalDate.of(2026, 10, 15)))
                .isInstanceOf(PlannerUnavailableException.class);
    }
}
