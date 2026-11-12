package app.wingtipmaps.gateway.upstream;

import app.wingtipmaps.gateway.planner.model.PlannerCurrency;
import app.wingtipmaps.gateway.planner.model.PlannerCurrencyAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFillAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFilled;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementKind;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceItem;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerInspectionsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerPilotNotes;
import app.wingtipmaps.gateway.planner.model.PlannerStudioDraft;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.service.annotation.DeleteExchange;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.annotation.HttpExchange;
import org.springframework.web.service.annotation.PostExchange;

/**
 * What this app asks the planner on its own behalf, each a pure answer
 * from what is sent (the engine's rules, a pilot's notes, the Studio's
 * drafts): Spring's HTTP interface, its client made by Boot from the
 * "planner" group (application.yml, UpstreamClients), the asks and answers
 * the planner's own types generated from its document (the pom). A path
 * or a field the planner renames fails PlannerClientContractTest or the
 * build.
 */
@HttpExchange
public interface PlannerApi {

    /** Who a note belongs to, as the planner reads it (PlannerProxyController's):
     *  the pilot's id. */
    String PILOT_HEADER = "X-Pilot-Id";

    @PostExchange("/api/pilot/currency")
    PlannerCurrency currency(@RequestBody PlannerCurrencyAsk ask);

    @PostExchange("/api/pilot/experience")
    List<PlannerExperienceItem> experience(@RequestBody PlannerExperienceAsk ask);

    @PostExchange("/api/pilot/endorsements")
    PlannerEndorsements endorsements(@RequestBody PlannerEndorsementsAsk ask);

    @GetExchange("/api/pilot/endorsement-kinds")
    List<PlannerEndorsementKind> endorsementKinds();

    @PostExchange("/api/pilot/endorsement-fill")
    PlannerEndorsementFilled fill(@RequestBody PlannerEndorsementFillAsk ask);

    @PostExchange("/api/aircraft/inspections")
    PlannerInspections inspections(@RequestBody PlannerInspectionsAsk ask);

    /** The changes' sources, the two briefings embedded as the JSON they
     *  came as (PlannerClient.changesAsk), never parsed here. */
    @PostExchange(url = "/api/words/changes/sources", contentType = MediaType.APPLICATION_JSON_VALUE)
    PlannerWordsSources changeSources(@RequestBody String ask);

    @GetExchange("/api/checkpoint-notes/mine")
    PlannerPilotNotes notes(@RequestHeader(PILOT_HEADER) String pilotId);

    @DeleteExchange("/api/checkpoint-notes/mine")
    void forgetNotes(@RequestHeader(PILOT_HEADER) String pilotId);

    @GetExchange("/api/studio/drafts-to-notice")
    List<PlannerStudioDraft> draftsToNotice();

    @PostExchange("/api/studio/drafts/{id}/noticed")
    void noticed(@PathVariable String id);
}
