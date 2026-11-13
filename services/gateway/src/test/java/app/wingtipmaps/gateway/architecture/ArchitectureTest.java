package app.wingtipmaps.gateway.architecture;

import static com.tngtech.archunit.core.domain.JavaCall.Predicates.target;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.type;
import static com.tngtech.archunit.core.domain.properties.HasName.Predicates.nameMatching;
import static com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.freeze.FreezingArchRule;

/**
 * The gateway's place in the architecture, as tests (CLAUDE.md, "Architecture" and "Simplicity rules"): it is
 * who the pilot is and what they saved, holds no aviation rule, and asks the planner through PlannerClient.
 *
 * <p>What breaks a rule today is frozen in src/test/resources/archunit_store (ArchUnit's FreezingArchRule): a
 * new break fails, a fixed one leaves the store, and the store is never added to by hand. The simplicity audit
 * of 2026-11-12 (finding 6) found five classes each building their own HTTP client to the planner.
 */
@AnalyzeClasses(packages = "app.wingtipmaps.gateway", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    /**
     * The planner through PlannerClient and the generated Planner* models only. Besides it, the proxy that
     * forwards the public API (StreamingProxy, UpstreamRoutes, PlannerProxyController), the health probe, and
     * Apple's revocation endpoint (not the planner) hold an HTTP client.
     */
    @ArchTest
    static final ArchRule PLANNER_THROUGH_ITS_CLIENT = FreezingArchRule.freeze(noClasses()
            .that()
            .doNotHaveSimpleName("PlannerClient")
            .and()
            .doNotHaveSimpleName("StreamingProxy")
            .and()
            .doNotHaveSimpleName("UpstreamRoutes")
            .and()
            .doNotHaveSimpleName("PlannerProxyController")
            .and()
            .doNotHaveSimpleName("HealthProbe")
            .and()
            .doNotHaveSimpleName("AppleRevocation")
            .should()
            .dependOnClassesThat()
            .haveFullyQualifiedName("java.net.http.HttpClient")
            .orShould()
            .dependOnClassesThat()
            .haveFullyQualifiedName("org.springframework.web.client.RestClient")
            .orShould()
            .dependOnClassesThat()
            .haveFullyQualifiedName("org.springframework.web.client.RestTemplate")
            .because("the planner is asked through PlannerClient and its generated models, which fail the build "
                    + "when the API changes; a hand-built client and a typed-in path do not"));

    /**
     * No aviation figure in the gateway: the sphere's trigonometry (great-circle distance, bearing, the wind
     * triangle) is the engine's, asked through the planner. Drawing a route's picture is the one use today.
     */
    @ArchTest
    static final ArchRule NO_AVIATION_MATHS = FreezingArchRule.freeze(noClasses()
            .should()
            .callMethodWhere(target(owner(type(Math.class)))
                    .and(target(nameMatching("sin|cos|tan|asin|acos|atan|atan2|toRadians|toDegrees|hypot"))))
            .orShould()
            .callMethodWhere(target(owner(type(StrictMath.class))))
            .because("every aviation rule or figure lives in the Rust engine once (CLAUDE.md, decision 0001); "
                    + "the gateway holds no aviation logic"));
}
