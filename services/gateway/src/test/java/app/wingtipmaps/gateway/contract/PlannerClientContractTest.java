package app.wingtipmaps.gateway.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;
import static org.mockito.Mockito.mock;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.service.AccountService;
import app.wingtipmaps.gateway.service.AppleRevocation;
import app.wingtipmaps.gateway.service.ChangeLines;
import app.wingtipmaps.gateway.service.CheckpointNotesClient;
import app.wingtipmaps.gateway.service.CrashDraftMail;
import app.wingtipmaps.gateway.service.Mailer;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.PlannerUnavailableException;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import app.wingtipmaps.gateway.upstream.Upstreams;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Every call the gateway makes to the planner by hand -- PlannerClient's
 * rules and the briefing, what ChangeLines, CheckpointNotesClient and
 * CrashDraftMail ask through it, and AccountService's forgetting of a
 * pilot's notes -- held to services/planner/openapi.json, the planner's own
 * document as this jar was built with it. The asks and answers' fields
 * are the planner's own types, generated from that document as the jar
 * builds, so a field renamed fails the build; what is still written by
 * hand is checked here. Each call is made for real against a stub that
 * answers with every field the document says the operation answers (so
 * each answer is read, and made into the gateway's own, as it would be);
 * what the client sent is then checked against the operation: the path
 * and method exist, every required field or query parameter is sent
 * (the generated types let one be left null), nothing is sent the
 * operation does not take, and each value is null only where the planner
 * takes null. The briefing's query and the changes' body, for the
 * assistant, are written by hand and checked the same way.
 */
class PlannerClientContractTest {

    /** One call as made: the client method it is, and how to make it. */
    record Call(String name, Consumer<Clients> make) {
        String method() {
            return name.replaceAll(" .*", "");
        }
    }

    record Clients(
            PlannerClient planner,
            AccountService accounts,
            ChangeLines lines,
            CheckpointNotesClient notes,
            CrashDraftMail drafts) {}

    private static final LocalDate DAY = LocalDate.of(2026, 11, 9);

    /** Each method that asks the planner, once with every optional field
     *  given and once, where it has any, with them left out. */
    static final List<Call> CALLS = List.of(
            new Call(
                    "briefing",
                    c -> c.planner()
                            .briefing("KDLH", "KMSP", List.of("KHYR"), Instant.parse("2026-11-09T15:00:00Z"), 95.0)),
            new Call(
                    "briefing (no stops)",
                    c -> c.planner().briefing("KDLH", "KMSP", List.of(), Instant.parse("2026-11-09T15:00:00Z"), null)),
            new Call(
                    "changes", c -> c.planner().changes("KDLH", "KMSP", List.of("KHYR"), Stub.briefing, Stub.briefing)),
            new Call(
                    "currency",
                    c -> c.planner().currency(logbook(), DAY.minusYears(1), DAY.plusYears(2), DAY.minusMonths(3), DAY)),
            new Call("currency (no dates)", c -> c.planner().currency(logbook(), null, null, null, DAY)),
            new Call("experience", c -> c.planner().experience(logbook(), DAY)),
            new Call(
                    "endorsements",
                    c -> c.planner()
                            .endorsements(
                                    List.of(
                                            PlannerClient.held("solo", DAY, "C172"),
                                            PlannerClient.held("solo-xc", DAY, null)),
                                    DAY.plusDays(3))),
            new Call("endorsements (no flight)", c -> c.planner().endorsements(List.of(), null)),
            new Call("endorsementKinds", c -> c.planner().endorsementKinds()),
            new Call("fill", c -> c.planner().fill("solo", "A. Pilot", Map.of("makeModel", "C172"))),
            new Call("inspections", c -> c.planner().inspections(DAY, DAY, DAY, DAY, 1234.5, DAY, "VOT", 2.0)),
            new Call(
                    "inspections (none recorded)",
                    c -> c.planner().inspections(null, null, null, null, null, null, null, null)),
            new Call(
                    "AccountService.delete",
                    c -> c.accounts().delete(new Pilot("pilot@example.com", "A. Pilot", "sub-1"))),
            new Call(
                    "ChangeLines.changes",
                    c -> c.lines().changes("KDLH", "KMSP", List.of("KHYR"), Stub.briefing, Stub.briefing)),
            new Call(
                    "CheckpointNotesClient.mine",
                    c -> c.notes().mine(new Pilot("pilot@example.com", "A. Pilot", "sub-1"))),
            // The drafts to notice, each mailed and then marked noticed.
            new Call("CrashDraftMail.everyFewMinutes", c -> c.drafts().everyFewMinutes()));

    /** PlannerClient's methods that ask nothing themselves. */
    private static final Set<String> NOT_CALLS = Set.of("endorsementKind"); // a filter over endorsementKinds()

    /** The gateway forwards the briefings it watches to the assistant,
     *  which hands the body whole to the planner's words sources: the body
     *  is the planner's ChangesAsk, though the assistant is who is asked. */
    private static final Map<String, String> BODY_FOR = Map.of("changes", "/api/words/changes/sources");

    @Test
    void everyCallFitsThePlannersDocument() {
        List<String> problems = problems(OpenApiContract.shipped("planner"), OpenApiContract.shipped("assistant"));
        if (!problems.isEmpty()) {
            fail("The gateway's calls do not fit services/planner/openapi.json:\n  " + String.join("\n  ", problems));
        }
    }

    @Test
    void everyMethodThatAsksThePlannerIsCovered() {
        Set<String> methods = Arrays.stream(PlannerClient.class.getDeclaredMethods())
                .filter(m ->
                        Modifier.isPublic(m.getModifiers()) && !Modifier.isStatic(m.getModifiers()) && !m.isSynthetic())
                .map(Method::getName)
                .collect(Collectors.toCollection(TreeSet::new));
        methods.removeAll(NOT_CALLS);
        Set<String> covered = CALLS.stream()
                .map(Call::method)
                .filter(n -> !n.contains("."))
                .collect(Collectors.toCollection(TreeSet::new));
        assertThat(covered)
                .as("PlannerClient's public methods each need a Call in CALLS (or a reason in NOT_CALLS)")
                .isEqualTo(methods);
    }

    // The negative cases: a copy of the document with one thing changed, as
    // a rename in the planner would change it, is caught and named.

    @Test
    void aBodyFieldRenamedIsNamed() {
        JsonNode planner = OpenApiContract.shipped("planner").deepCopy();
        rename(planner, "CurrencyAsk", "today", "asOf");
        assertThat(problems(planner, OpenApiContract.shipped("assistant")))
                .anySatisfy(p -> assertThat(p)
                        .startsWith("PlannerClient.currency:")
                        .contains("body.today is sent, but the planner has no such field"))
                .anySatisfy(p -> assertThat(p)
                        .startsWith("PlannerClient.currency:")
                        .contains("body.asOf is required, but is not sent"));
    }

    @Test
    void aQueryParameterRenamedIsNamed() {
        JsonNode planner = OpenApiContract.shipped("planner").deepCopy();
        for (JsonNode param : planner.at("/paths/~1api~1briefing/get/parameters")) {
            if (param.path("name").asString().equals("ete_min")) {
                ((ObjectNode) param).put("name", "ete_minutes");
            }
        }
        assertThat(problems(planner, OpenApiContract.shipped("assistant")))
                .anySatisfy(p -> assertThat(p)
                        .startsWith("PlannerClient.briefing:")
                        .contains("query parameter 'ete_min' is sent"));
    }

    @Test
    void anOperationGoneIsNamed() {
        JsonNode planner = OpenApiContract.shipped("planner").deepCopy();
        ((ObjectNode) planner.get("paths")).remove("/api/pilot/endorsement-kinds");
        assertThat(problems(planner, OpenApiContract.shipped("assistant")))
                .anySatisfy(
                        p -> assertThat(p)
                                .isEqualTo(
                                        "PlannerClient.endorsementKinds: GET /api/pilot/endorsement-kinds is not in services/planner/openapi.json"));
    }

    private static void rename(JsonNode document, String schema, String from, String to) {
        ObjectNode properties = (ObjectNode) document.at("/components/schemas/" + schema + "/properties");
        properties.set(to, properties.remove(from));
        ArrayNode required = (ArrayNode) document.at("/components/schemas/" + schema + "/required");
        for (int i = 0; i < required.size(); i++) {
            if (required.get(i).asString().equals(from)) {
                required.set(i, required.stringNode(to));
            }
        }
    }

    /** What is wrong with every call in CALLS against the two documents,
     *  each problem headed by the client method it is in. */
    static List<String> problems(JsonNode plannerDocument, JsonNode assistantDocument) {
        OpenApiContract planner = new OpenApiContract(plannerDocument);
        List<String> problems = new ArrayList<>();
        try (Stub plannerStub = new Stub("planner", planner);
                Stub assistantStub = new Stub("assistant", new OpenApiContract(assistantDocument))) {
            Stub.briefing = new AnswerContract(planner)
                    .sample(planner.operation("GET", "/api/briefing")
                            .flatMap(OpenApiContract::answerSchema)
                            .orElseThrow())
                    .toString();
            PlannerClient client = Upstreams.plannerClient(plannerStub.url(), assistantStub.url());
            Clients clients = new Clients(
                    client,
                    accounts(plannerStub.url()),
                    new ChangeLines(client),
                    new CheckpointNotesClient(client),
                    new CrashDraftMail(client, new Mailer(mock(JavaMailSender.class), "x@y"), "dev@example.com", ""));
            for (Call call : CALLS) {
                String who = call.method().contains(".") ? call.method() : "PlannerClient." + call.method();
                List<Stub.Asked> asked = new ArrayList<>();
                plannerStub.asked.clear();
                assistantStub.asked.clear();
                try {
                    call.make().accept(clients);
                } catch (PlannerUnavailableException | AccountService.AccountNotDeletedException refused) {
                    // What it asked is checked below: a refusal is the stub's
                    // 404. An answer of every field it may have that cannot
                    // be read is the client's fault, though.
                    if (String.valueOf(refused.getMessage()).contains("was not its answer")) {
                        problems.add(who + ": " + refused.getMessage() + " (" + refused.getCause() + ")");
                    }
                }
                asked.addAll(plannerStub.asked);
                asked.addAll(assistantStub.asked);
                if (asked.isEmpty()) {
                    problems.add(who + ": asked nothing of the planner");
                }
                for (Stub.Asked one : asked) {
                    problems.addAll(check(call, one, planner).stream()
                            .map(p -> who + ": " + p)
                            .toList());
                }
            }
        }
        return problems.stream().distinct().toList();
    }

    private static List<String> check(Call call, Stub.Asked asked, OpenApiContract planner) {
        List<String> problems = new ArrayList<>();
        OpenApiContract document = asked.stub().contract;
        JsonNode operation = document.operation(asked.method(), asked.path()).orElse(null);
        if (operation == null) {
            problems.add(asked.method() + " " + asked.path() + " is not in services/" + asked.stub().service
                    + "/openapi.json");
            return problems;
        }
        problems.addAll(document.checkQuery(operation, asked.query()));
        Map<String, JsonNode> headers = OpenApiContract.parameters(operation, "header");
        asked.headers().forEach((name, value) -> {
            if (name.toLowerCase().startsWith("x-") && headers.keySet().stream().noneMatch(name::equalsIgnoreCase)) {
                problems.add("header " + name + " is sent, but the operation takes no such header " + headers.keySet());
            }
        });
        String bodyPath = BODY_FOR.get(call.method());
        JsonNode bodyOperation = bodyPath == null
                ? operation
                : planner.operation("POST", bodyPath).orElse(null);
        if (bodyOperation == null) {
            problems.add("POST " + bodyPath + ", which takes this body on, is not in services/planner/openapi.json");
        } else {
            JsonNode schema = OpenApiContract.requestSchema(bodyOperation).orElse(null);
            OpenApiContract against = bodyPath == null ? document : planner;
            if (schema != null && asked.body().isBlank()) {
                problems.add("no body is sent, but " + asked.method() + " " + asked.path() + " takes one");
            } else if (schema != null) {
                problems.addAll(against.check(Stub.parse(asked.body()), schema, "body"));
            }
        }
        return problems;
    }

    @SuppressWarnings("unchecked")
    private static AccountService accounts(String plannerUrl) {
        return new AccountService(
                mock(PilotRepository.class),
                mock(MagicLinkRepository.class),
                mock(FindByIndexNameSessionRepository.class),
                mock(TransactionTemplate.class),
                mock(AppleRevocation.class),
                Upstreams.client(PlannerApi.class, plannerUrl));
    }

    private static List<LogbookEntry> logbook() {
        Pilot pilot = new Pilot("pilot@example.com", "A. Pilot", "sub-1");
        return List.of(new LogbookEntry(pilot)
                .set(LocalDate.of(2026, 9, 20), "N12345", "C172", null, 1.5, 0, 0, 3, 1, null)
                .instrument(6, true, false));
    }
}
