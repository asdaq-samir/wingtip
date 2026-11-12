package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.planner.model.PlannerCheckpointNote;
import app.wingtipmaps.gateway.planner.model.PlannerPilotNotes;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The checkpoint notes a pilot wrote for themselves, which the planner
 * keeps (services/planner app.routers.notes, GET
 * /api/checkpoint-notes/mine), read for their export: the one record of
 * theirs this app does not hold. The planner's route is internal (no
 * x-gateway mark), so a browser cannot ask it; this app names the pilot
 * by the header the planner reads, as AccountService does to delete them.
 * Asked through {@link PlannerClient}, this app's one client of the planner.
 */
@Component
public class CheckpointNotesClient {

    private final PlannerClient planner;

    public CheckpointNotesClient(PlannerClient planner) {
        this.planner = planner;
    }

    /**
     * The pilot's own notes, oldest first.
     *
     * @throws PlannerUnavailableException when the planner cannot be asked or answers otherwise
     */
    public List<PlannerCheckpointNote> mine(Pilot pilot) {
        List<PlannerCheckpointNote> notes = planner.get(
                        "/api/checkpoint-notes/mine",
                        PlannerPilotNotes.class,
                        "the notes",
                        AccountService.PILOT_HEADER,
                        String.valueOf(pilot.getId()))
                .getNotes();
        return notes == null ? List.of() : notes;
    }
}
