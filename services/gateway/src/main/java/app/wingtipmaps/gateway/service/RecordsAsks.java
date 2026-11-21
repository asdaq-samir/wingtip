package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.dto.SignedEndorsementDto;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerRecordsBatch;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.IntStream;
import org.jspecify.annotations.Nullable;

/**
 * The planner's rules a page of records needs, gathered while its records
 * are read and asked in one call after (PlannerClient#records, POST
 * /api/pilot/records-batch): each student's 61.109(a) experience and every
 * endorsements ask -- a solo endorsement's day (61.87(n), (p)), a review's
 * 61.93(d) checks, a signed list's last good days. The same ask made twice
 * (one student's checks for one day, say) is sent once.
 *
 * <p>The pages read their records in a short read-only transaction and ask
 * the planner after it: a Hikari connection held across the planner's
 * calls (up to 20 s each, with one retry) let about ten slow pages empty the
 * pool of ten (waste-server audit B).
 */
final class RecordsAsks {

    private final List<PlannerExperienceAsk> experience = new ArrayList<>();
    private final List<PlannerEndorsementsAsk> endorsements = new ArrayList<>();
    private final Map<Object, Integer> experienceOf = new HashMap<>();
    private final Map<Object, Integer> endorsementsOf = new HashMap<>();

    /** The experience from {@code entries} on {@code today}, asked once a {@code key}. */
    int experience(Object key, Supplier<List<LogbookEntry>> entries, LocalDate today) {
        return experienceOf.computeIfAbsent(key, k -> {
            experience.add(PlannerAsks.experienceAsk(entries.get(), today));
            return experience.size() - 1;
        });
    }

    /** What {@code held} say for a flight on {@code flightOn} (null for
     *  none), asked once a {@code key}. */
    int endorsements(Object key, Supplier<List<PlannerHeldEndorsement>> held, @Nullable LocalDate flightOn) {
        return endorsementsOf.computeIfAbsent(key, k -> {
            endorsements.add(new PlannerEndorsementsAsk(held.get()).flightOn(flightOn));
            return endorsements.size() - 1;
        });
    }

    /** The last good days of signed endorsements, in order, as
     *  EndorsementRecords#untilOf asks them; -1 for none, which asks nothing. */
    int untilOf(Object key, List<SignedEndorsement> signed) {
        return signed.isEmpty()
                ? -1
                : endorsements(
                        key,
                        () -> signed.stream()
                                .map(e -> PlannerAsks.held(e.getCode(), e.getSignedOn(), null))
                                .toList(),
                        null);
    }

    /** Everything gathered, asked in one call (none where nothing was). */
    Answers ask(PlannerClient planner) {
        return new Answers(planner.records(List.copyOf(experience), List.copyOf(endorsements)));
    }

    /** The planner's answers, by the index each ask was given. */
    record Answers(PlannerRecordsBatch batch) {

        List<ExperienceItemDto> experience(int i) {
            return PlannerAsks.experienceOf(batch.getExperience().get(i));
        }

        PlannerEndorsements endorsements(int i) {
            return batch.getEndorsements().get(i);
        }

        List<ReviewCheckDto> checks(int i) {
            return endorsements(i).getChecks().stream().map(PlannerAsks::checkOf).toList();
        }

        /** {@code dtos} (read with no last good day) with the days asked at
         *  {@link RecordsAsks#untilOf}'s {@code i}. */
        List<SignedEndorsementDto> until(int i, List<SignedEndorsementDto> dtos) {
            if (i < 0) {
                return dtos;
            }
            List<LocalDate> until = endorsements(i).getUntil();
            return IntStream.range(0, dtos.size())
                    .mapToObj(k -> dtos.get(k).withUntil(until.get(k)))
                    .toList();
        }
    }
}
