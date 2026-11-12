package app.wingtipmaps.gateway;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.DeferredFor;
import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.FlightCheckpoint;
import app.wingtipmaps.gateway.domain.FlightTrack;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.MagicLink;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.Squawk;
import app.wingtipmaps.gateway.domain.Subscription;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.FlightTrackRepository;
import app.wingtipmaps.gateway.repository.LogbookRepository;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.repository.SquawkRepository;
import app.wingtipmaps.gateway.repository.SubscriptionRepository;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * What the account tests share, against a real Postgres: a pilot with one
 * of everything a pilot can have, every table that holds a pilot's data
 * counted (rowsOf), and a stand-in planner, which keeps the pilot's own
 * checkpoint notes. Deleting is decided by the schema's ON DELETE
 * CASCADEs as much as by the code, so the counts are of the tables, not
 * of what the code says it deletes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
abstract class AccountTestBase {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    /** The planner, which keeps the pilot's own checkpoint notes. */
    private static HttpServer planner;

    /** The pilot's own note, as the planner answers GET /api/checkpoint-notes/mine. */
    static final String NOTES =
            "{\"notes\":[{\"route\":\"C81->KDLH\",\"lat\":45.0,\"lon\":-90.0,\"description\":\"Water tower\",\"created_at\":\"2026-10-01T00:00:00+00:00\"}]}";

    static final List<String> plannerAsked = new CopyOnWriteArrayList<>();
    static volatile int plannerStatus = 200;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    PilotRepository pilots;

    @Autowired
    AircraftRepository aircraft;

    @Autowired
    SquawkRepository squawks;

    @Autowired
    FlightRepository flights;

    @Autowired
    FlightTrackRepository tracks;

    @Autowired
    LogbookRepository logbook;

    @Autowired
    EndorsementRepository endorsements;

    @Autowired
    MagicLinkRepository magicLinks;

    @Autowired
    SubscriptionRepository subscriptions;

    @Autowired
    FindByIndexNameSessionRepository<? extends Session> sessions;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeAll
    static void startPlanner() throws IOException {
        planner = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        planner.createContext("/", exchange -> {
            plannerAsked.add(
                    exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath() + " pilot="
                            + exchange.getRequestHeaders().getFirst("X-Pilot-Id"));
            // The export's training record asks the engine what the
            // endorsements say; it answers every field its document
            // requires, as the planner does: under Jackson 3 the generated
            // model leaves a missing list null rather than empty.
            String path = exchange.getRequestURI().getPath();
            byte[] body = (path.equals("/api/pilot/endorsements")
                            ? "{\"checks\":[],\"soloUntil\":null,\"until\":[]}"
                            : exchange.getRequestMethod().equals("GET") && path.equals("/api/checkpoint-notes/mine")
                                    ? NOTES
                                    : "{\"removed\":1}")
                    .getBytes();
            exchange.sendResponseHeaders(plannerStatus, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        planner.start();
    }

    @AfterAll
    static void stopPlanner() {
        planner.stop(0);
    }

    @DynamicPropertySource
    static void plannerUrl(DynamicPropertyRegistry registry) {
        registry.add(
                "app.planner.base-url",
                () -> "http://127.0.0.1:" + planner.getAddress().getPort());
    }

    @BeforeEach
    void reset() {
        plannerAsked.clear();
        plannerStatus = 200;
    }

    /** A pilot with one of everything a pilot can have, and a session. */
    Pilot pilotWithEverything() {
        String email = UUID.randomUUID() + "@example.com";
        String google = "google-" + UUID.randomUUID();
        Pilot pilot = pilots.save(new Pilot(email, "Test Pilot", google));
        Aircraft plane = aircraft.save(
                new Aircraft(pilot, "N" + email.substring(0, 5), "C172", 110, 8.5, null, null, null, null));
        Flight flight = flights.save(new Flight(pilot, plane, "C81", "KDLH")
                .fileNavLog(
                        List.of(
                                new FlightCheckpoint(0, "C81", "departure", 42.3172, -88.0905, 0.0)
                                        .withLeg(4.0, 319.0, 322.0, 116.0, 2.1, 0.3),
                                new FlightCheckpoint(1, "KDLH", "destination", 46.8421, -92.1936, 323.4)),
                        2500,
                        323.6,
                        171.0,
                        24.2));
        tracks.save(new FlightTrack(
                flight.getId(),
                "test",
                "[{\"t\":0,\"lat\":42.3,\"lon\":-88.1},{\"t\":60000,\"lat\":46.8,\"lon\":-92.2}]",
                2));
        squawks.save(new Squawk(plane)
                .set(LocalDate.of(2026, 10, 1), "Landing light out", true, DeferredFor.VFR_DAY, null, null));
        logbook.save(new LogbookEntry(pilot)
                .set(LocalDate.of(2026, 10, 1), "N12345", "C172", "C81-KDLH", 2.5, 0, 2.5, 1, 0, null));
        endorsements.save(new Endorsement(pilot.getId(), "A.1", LocalDate.of(2026, 9, 1)));
        // An instructor asked in, an endorsement signed for them, and a solo
        // cross-country put to an instructor (V26) -- themselves, for the
        // schema's sake.
        jdbc.update(
                "INSERT INTO instructor_students (student_id, email, asked_at) VALUES (?, ?, now())",
                pilot.getId(),
                "cfi-" + email);
        jdbc.update(
                "INSERT INTO signed_endorsements (student_id, code, student_name, fields, text, signature, signed_on, signed_at,"
                        + " digest) VALUES (?, 'solo-first', 'Test Pilot', '{}'::jsonb, 'I certify', '/s/', ?, now(), repeat('0', 64))",
                pilot.getId(),
                LocalDate.of(2026, 10, 1));
        jdbc.update(
                "INSERT INTO cross_country_reviews (student_id, instructor_id, flight_id, make_model, flight_on, asked_at)"
                        + " VALUES (?, ?, ?, 'Cessna 172', ?, now())",
                pilot.getId(),
                pilot.getId(),
                flight.getId(),
                LocalDate.of(2026, 10, 2));
        // An approach set them as a lesson (V30), by themselves again.
        jdbc.update(
                "INSERT INTO approach_lessons (student_id, instructor_id, airport_ident, procedure_id, procedure_name, created_at,"
                        + " updated_at) VALUES (?, ?, 'KDLH', 'I09', 'ILS RWY 09', now(), now())",
                pilot.getId(),
                pilot.getId());
        // The free month started, and a written briefing counted against its cap.
        subscriptions.save(new Subscription(pilot.getId(), Instant.now()));
        jdbc.update(
                "INSERT INTO paid_feature_uses (pilot_id, month, feature, uses) VALUES (?, ?, 'NARRATIVE', 1)",
                pilot.getId(),
                LocalDate.of(2026, 10, 1));
        // Shared by link, watched, a reminder sent, and an AI app connected
        // (V39, V31, V23, V40): what the export and both deletions must reach.
        jdbc.update(
                "INSERT INTO flight_shares (flight_id, token, shared_at) VALUES (?, ?, now())",
                flight.getId(),
                UUID.randomUUID().toString().replace("-", ""));
        jdbc.update(
                "INSERT INTO flight_watch (flight_id, pilot_id, depart_at, briefing_json, created_at)"
                        + " VALUES (?, ?, now() + interval '1 day', '{}', now())",
                flight.getId(),
                pilot.getId());
        jdbc.update(
                "INSERT INTO reminders_sent (pilot_id, what, due_on, days_before) VALUES (?, 'medical', ?, 30)",
                pilot.getId(),
                LocalDate.of(2026, 12, 1));
        String client = UUID.randomUUID().toString();
        jdbc.update(
                "INSERT INTO oauth2_registered_client (id, client_id, client_name, client_authentication_methods,"
                        + " authorization_grant_types, scopes, client_settings, token_settings)"
                        + " VALUES (?, ?, 'Claude', 'none', 'authorization_code', 'wingtip:read', '{}', '{}')",
                client,
                client);
        jdbc.update(
                "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type,"
                        + " authorized_scopes, access_token_value, access_token_issued_at)"
                        + " VALUES (?, ?, ?, 'authorization_code', 'wingtip:read', 'secret-token', now())",
                UUID.randomUUID().toString(),
                client,
                pilot.getId().toString());
        jdbc.update(
                "INSERT INTO oauth2_authorization_consent (registered_client_id, principal_name, authorities)"
                        + " VALUES (?, ?, 'SCOPE_wingtip:read')",
                client,
                pilot.getId().toString());
        magicLinks.save(new MagicLink(
                email,
                UUID.randomUUID().toString().replace("-", ""),
                Instant.now().plusSeconds(600)));
        // Two devices by address, and one by Google.
        signIn(email);
        signIn(email);
        signIn(google);
        return pilot;
    }

    private <S extends Session> void signIn(String email, FindByIndexNameSessionRepository<S> repository) {
        S session = repository.createSession();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new MagicLinkAuthenticationToken(email));
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        repository.save(session);
    }

    void signIn(String email) {
        signIn(email, sessions);
    }

    /** Rows of each table that are the pilot's, by their id and address. */
    List<Integer> rowsOf(Pilot pilot) {
        Long id = pilot.getId();
        return List.of(
                jdbc.queryForObject("SELECT count(*) FROM pilots WHERE id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM aircraft WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM flights WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject(
                        "SELECT count(*) FROM flight_checkpoints c JOIN flights f ON f.id = c.flight_id "
                                + "WHERE f.pilot_id = ?",
                        Integer.class,
                        id),
                jdbc.queryForObject(
                        "SELECT count(*) FROM flight_tracks t JOIN flights f ON f.id = t.flight_id "
                                + "WHERE f.pilot_id = ?",
                        Integer.class,
                        id),
                jdbc.queryForObject(
                        "SELECT count(*) FROM aircraft_squawks s JOIN aircraft a ON a.id = s.aircraft_id "
                                + "WHERE a.pilot_id = ?",
                        Integer.class,
                        id),
                jdbc.queryForObject("SELECT count(*) FROM logbook_entries WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM pilot_endorsements WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM instructor_students WHERE student_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM signed_endorsements WHERE student_id = ?", Integer.class, id),
                jdbc.queryForObject(
                        "SELECT count(*) FROM cross_country_reviews WHERE student_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM approach_lessons WHERE student_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM subscriptions WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM paid_feature_uses WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject(
                        "SELECT count(*) FROM magic_links WHERE email = ?", Integer.class, pilot.getEmail()),
                jdbc.queryForObject(
                        "SELECT count(*) FROM flight_shares s JOIN flights f ON f.id = s.flight_id WHERE f.pilot_id = ?",
                        Integer.class,
                        id),
                jdbc.queryForObject("SELECT count(*) FROM flight_watch WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject("SELECT count(*) FROM reminders_sent WHERE pilot_id = ?", Integer.class, id),
                jdbc.queryForObject(
                        "SELECT count(*) FROM oauth2_authorization WHERE principal_name = ?",
                        Integer.class,
                        id.toString()),
                jdbc.queryForObject(
                        "SELECT count(*) FROM oauth2_authorization_consent WHERE principal_name = ?",
                        Integer.class,
                        id.toString()),
                sessions.findByPrincipalName(pilot.getEmail()).size(),
                sessions.findByPrincipalName(pilot.getGoogleSubject()).size());
    }
}
