# services/gateway/

`gateway` — who the pilot is and what they saved. It is the only service
a browser talks to: it owns sign-in, holds the pilot's records in
Postgres (aircraft, flights, the logbook, endorsements, an instructor's
students), serves the React bundle, proxies the planner, and sends the
scheduled mail (reminders, the flight watch).

Everything else in this repo sits behind it on a private network.

It is one of the project's four layers, and the one that should have no
aviation logic. A figure it needs should come from the planner over HTTP
(`PlannerClient`, which today asks for a flight's briefing and what
changed in it, and reads the planner's answers as models generated at
build time from `services/planner/openapi.json` by the pom's
openapi-generator plugin), which asks the Rust engine; Spring keeps identity and persistence, the
things it is good at. The owner kept Java here on that line on
2026-11-06 rather than folding it into the Python: the HTTP boundary is
already clean and a merge would give a pilot nothing. A pilot's
currency (14 CFR 61.56, 61.57) and a student's 61.109 experience are the
engine's: this app sends the logbook to the planner (`PlannerClient`,
POST /api/pilot/currency and /api/pilot/experience) and keeps what it
answers, a reminder email included. So are what a student's
endorsements say (how long each is good for, the day the solo
endorsement runs out, 61.93(d)'s checks of a solo cross-country: POST
/api/pilot/endorsements) and when an airplane's inspections and VOR check
fall due (91.409, 91.207, 91.411, 91.413, 91.171: POST
/api/aircraft/inspections), and AC 61-65K's endorsements, their words and
the fields they take (GET /api/pilot/endorsement-kinds, POST
/api/pilot/endorsement-fill: the engine's endorsement_kinds and
endorsement_fill). Add no rule here.

## Contents

- [Running it](#running-it)
- [Learning this from zero](#learning-this-from-zero)
- [The package map](#the-package-map)
- [Things that are not obvious](#things-that-are-not-obvious)

## Running it

```bash
docker compose up -d --build gateway
# http://localhost:8080/app/plan
# http://localhost:8080/swagger-ui/index.html
```

`gateway` brings up `db` and `planner` with it.

```bash
# The JUnit suite, including Testcontainers' real Postgres. No native
# Maven needed; the Docker socket is passed through so Testcontainers can
# start a sibling container.
docker run --rm -v "$PWD/services/gateway":/build -v /build/target \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  -w /build maven:3.10-eclipse-temurin-25 mvn -B test
```

Three details in that command each fix a real failure, not a style
preference:

- **`-e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal`, not
  `--add-host=host.docker.internal:host-gateway`.** The two solve
  different halves of the problem — `--add-host` only makes the
  hostname *resolvable* inside this container; it never tells
  Testcontainers to actually *use* it when reaching back into a
  sibling container it started via the mounted socket. Without the env
  var, Testcontainers tries the Docker bridge gateway directly and
  fails to reach its own Ryuk resource-reaper: `Could not connect to
  Ryuk at 172.17.0.1:<port>`.
- **`-v /build/target`**, an anonymous volume, not the host directory —
  on a repo synced by iCloud, a build run outside Docker (an IDE, a
  local `mvn`) can leave iCloud sync-conflict copies in `target/`
  (`V1__create_routes_table 3.sql` and similar), and Flyway then
  refuses to start with "found more than one migration with version
  1". The anonymous volume is empty on every run, so the host's
  `target/` — conflict copies included — never enters the build.
- **No `clean`.** The Maven clean plugin cannot delete a mount point
  ("Device or resource busy"), which the anonymous volume above is.

## Learning this from zero

The bare minimum is one file. Spring Initializr
([start.spring.io](https://start.spring.io)) with a single dependency,
*Spring Web*, gives you a runnable service:

```java
@SpringBootApplication
@RestController
public class App {
    public static void main(String[] args) { SpringApplication.run(App.class, args); }

    @GetMapping("/hello")
    public String hello() { return "VFR route"; }
}
```

`mvn spring-boot:run`, then `curl localhost:8080/hello`. That is the
whole framework at its smallest: an annotation that starts an embedded
Tomcat, and a method that answers a path.

### The rungs

Each rung adds one Spring *starter*, and each starter earns itself by
solving a problem the previous rung creates.

1. **Answer a path** (above). `spring-boot-starter-web`. No database, no
   security, no tests.

2. **Return an object, not a string.** Make the method return a record.
   Spring serialises it to JSON with no work from you — that is
   Jackson arriving as a transitive dependency, and it is worth knowing
   it is doing the work rather than the framework itself.

3. **Take input, and validate it.** A `@PostMapping` with `@RequestBody`.
   Then send it nonsense and watch it fail with a 500 and a stack trace.
   The fix — `@Valid`, plus a `@RestControllerAdvice` — is
   `controller/GlobalExceptionHandler.java`, and the reason it exists is
   that an unhandled exception is a bad API response.

4. **Persist something** (`spring-boot-starter-data-jpa` + the Postgres
   driver). An `@Entity`, a `Repository` interface with no
   implementation, and suddenly you can save. Then change a field and
   watch Hibernate silently alter your table — which is why
   `ddl-auto: validate` is set here and Flyway owns the schema instead.

5. **Version the schema** (`flyway-core`). `V3__create_pilots_aircraft_flights.sql`.
   Migrations are ordinary SQL, applied in order, recorded in a table.
   Once this is in place `ddl-auto: validate` means the app refuses to
   start if the code and the schema disagree — a good failure.

6. **Test it properly** (`spring-boot-starter-test`, Testcontainers).
   Three flavours, all present here: `@WebMvcTest` for a controller with
   no database, plain Mockito for a service, and `@SpringBootTest` with a
   real Postgres in a container for persistence. An H2 in-memory database
   would be faster and would not catch Postgres-specific SQL.

7. **Call another service** (the JDK `HttpClient`).
   `PlannerProxyController.java` forwards `/api/planner/*` to
   `planner`. Now you need timeouts, and a decision about what
   happens when the other service is down.

8. **Add sign-in** (`spring-boot-starter-security` +
   `-oauth2-client`). The moment you add the starter, *everything* is
   locked including your health endpoint, and you have to say what is
   public. `security/SecurityConfig.java` is that list.

9. **Serve the front end.** Point `app.static-location` at the built
   bundle (the classpath for a local build, a directory beside the jar in
   the image) and one origin serves page and API — one session, one set
   of rules, no CORS.

### The method

Add one starter at a time and run the app after each. Spring's magic is
mostly *auto-configuration reacting to what is on the classpath*, so
adding a starter changes behaviour without you writing a line. Adding
them one at a time is the only way to see which one did what.

## The package map

One job per class.

| Package | What lives there |
|---|---|
| `controller/` | HTTP endpoints. `PlannerProxyController` forwards `/api/planner/*` to `planner`; `GlobalExceptionHandler` turns exceptions into JSON; `MagicLinkController` is the email sign-in flow's own two steps (request, verify). |
| `service/` | The records' logic: `PilotService`, `AircraftService`, `FlightService`, `LogbookService` and the rest, each scoped to the signed-in pilot; `PlannerClient`, the planner asked on this app's own behalf; `ReminderService` and `FlightWatchService`, the scheduled mail. |
| `repository/` | Spring Data interfaces. No implementations — Spring writes them. |
| `domain/` | JPA entities: `Pilot`, `Aircraft`, `Flight`, `FlightCheckpoint`, `MagicLink`, `LogbookEntry`, `Endorsement` and the rest. |
| `dto/` | Request and response shapes, kept separate from entities so the API and the schema can change independently. |
| `security/` | `SecurityConfig` (what is public), `OAuthClientsConfig` (builds Google/Apple's client registrations in Java, not YAML — Apple's own secret is a signed JWT no static property could hold), `MagicLinkAuthenticationToken` (the session's own principal after a magic-link sign-in), `DeveloperOnly` (whether the caller holds the developer role, read from their row on every request), `SignInOptions` (whether anyone can sign in here at all), and `CsrfCookieFilter` (forces the `XSRF-TOKEN` cookie to actually be written — see below). |
| `config/` | `WebMvcConfig` — static-resource and SPA routing. |

Thirty-one migrations, in `resources/db/migration/`. The first five: routes, then normalised
checkpoints, then pilots/aircraft/flights, then Apple's own subject
column plus the magic-link table, then dropping the routes pair again
once `planner` owned scoring and nothing here read them.

## Things that are not obvious

**`ddl-auto: validate`, never `update`.** Hibernate can alter tables to
match your entities, which is convenient right up to the moment it drops
a column in production. Flyway owns the schema; Hibernate is only allowed
to check that it matches and refuse to start if not.

**Settings are one record.** application.yml's `app` block is bound to
`AppProperties` and checked at start (`@Validated`), so a class takes the
record, not a value by name. `app.planner.base-url` reads
`${PLANNER_SERVICE_URL}`, which is the Compose hostname
(`http://planner:8000`) both locally and on the AWS server, which runs the
same Compose services (`infra/docker-compose.prod.yml`); the proxy, the
HTTP interface clients (`spring.http.serviceclient`) and the monitor all
read that one key.

**The paperwork is one list, read by the apps and the reminder emails
alike.** `PaperworkService` gathers what falls due for a pilot -- the
flight review, the medical, passengers by day and at night, instrument
currency (14 CFR 61.56(c), 61.23, 61.57(a)-(c)) -- and for each of their
airplanes the annual, the 100-hour where the owner says it is flown for
hire (91.409(a), (b)), the ELT's inspection and battery (91.207(d), (c)),
the static system (91.411(a)), the transponder (91.413(a)), the VOR check
(91.171(a)(2)) and the owner's own due items, an AD's status kept as
91.417(a)(2)(v) asks (`aircraft_due_items`, V32). Every day in it is the
engine's (through the planner) or the owner's; the service only names
each one, cites its rule and counts the days and hours left.
`GET /api/paperwork` is the apps' "Coming up"; `ReminderService` emails
the dated ones 30 and 7 days before, keyed in `reminders_sent` by what
they are ("aircraft-12-annual", "item-40"), so each is sent once. The
VOR check and hour-counted items are listed but not emailed.

**Sign-in is conditional, and three-way.** `oauth2Login` registers
only when `OAuthClientsConfig` actually produced a client registration
(real Google or Apple credentials, `oauth` profile active), so local
development needs no credentials and the pages open without a login
wall. Deploy with credentials set and the same code requires sign-in.
The magic-link flow (`MagicLinkController`) is separate from all of
that — no profile, no OIDC registration, just email address in,
one-time link out — and works (or fails to send, logged rather than
thrown) whether or not OIDC is configured.

**Planner writes need a session once anyone can sign in, and the
developer's work needs the developer role.** `GET /api/planner/**` is
public apart from the stack's own status and services; `POST`/`DELETE`
through the proxy (checkpoint notes, corridor builds, the billed
written briefing at `/api/planner/briefing/narrative`) require a session whenever `SecurityConfig`
sees a way to obtain one -- OIDC credentials or a configured
`MAIL_HOST` for the magic link. The developer's work -- picks (the
model's training labels), a retrain, a chart refresh,
`/api/planner/status` and `/api/planner/dev/**` -- needs
`PilotRole.DEVELOPER` on top of that, read from the pilot's row on
every request (`DeveloperOnly`), so granting or revoking the role with
an `UPDATE` takes effect at once. `app.developer-emails`
(`APP_DEVELOPER_EMAILS`) names addresses that are developers without
the `UPDATE`: each is given the role at its next sign-in or request.
Signing in lands a developer on `/app/dev` and anyone else on
`/app/plan` (`SignInLanding`), whichever way they signed in.

Locally it all applies the same way. docker-compose.yml runs a mail
catcher (Mailpit, its inbox at http://localhost:8025) as the gateway's
`MAIL_HOST`, so the emailed link is how the local stack signs in, and
`APP_DEVELOPER_EMAILS` defaults to `developer@example.com`, the
address the end-to-end tests sign in as. Put your own address in
`.env` to be a developer under it. To get your own links in your real
inbox, set `.env`'s `MAILPIT_RELAY_*` (an SMTP account, e.g. iCloud's
`smtp.mail.me.com` with an app-specific password, and `MAILPIT_RELAY_TO`,
a regular expression for the addresses to pass on): Mailpit relays
those and keeps every other address, the tests' included, local.

A sign-in lasts: sessions are kept in Postgres (spring-session-jdbc,
tables from Flyway's `V8__spring_session.sql`) and expire after 30 days
unused, with a cookie that outlives the browser, so a restart of the
gateway signs nobody out.

**`openapi.json` is committed, and a test holds it to the code.** The
front end's types for this app's endpoints are generated from it
(`apps/web/`'s `npm run types`), so `OpenApiDocumentTest` compares it with
what `/v3/api-docs` serves and fails on any difference. After changing
a controller or a DTO, run the suite with `WRITE_OPENAPI=1` in the
environment and commit the file. `config/OpenApiConfig.java` makes the
document say what Jackson sends: every field listed as required, and a
field declared `@Nullable` in its DTO typed as possibly null -- so a DTO
field that can be null and is not annotated generates a type that says
it cannot be.

**Testcontainers needs the Docker socket.** That is why the `mvn test`
command above mounts `/var/run/docker.sock`; without it the persistence
tests cannot start their Postgres.

**`CsrfCookieFilter` exists because the `XSRF-TOKEN` cookie is written
lazily.** `CookieCsrfTokenRepository` with
`CsrfTokenRequestAttributeHandler` — the standard setup — only writes the
cookie once something reads `csrfToken.getToken()` during the request,
which a server-rendered template does and a JSON-only API never does.
Without the filter no response carried the cookie, `apps/web/`'s `client.ts`
had no token to echo back, and every POST/DELETE failed CSRF validation —
reported as a 401 by Spring Security's own `HttpStatusEntryPoint`, since the caller is anonymous.
The filter forces the token to materialise on every request, the pattern
Spring's own docs recommend for an SPA.

**The planner proxy pins HTTP/1.1.** The JDK `HttpClient` defaults to
attempting an HTTP/2 upgrade, which uvicorn (HTTP/1.1 only) rejects with
`Unsupported upgrade request`; on a reused connection the *next* request
then arrives with no body, and FastAPI answers 422 for a body Spring
received intact. `.version(HttpClient.Version.HTTP_1_1)` on the shared
client is what prevents it.
