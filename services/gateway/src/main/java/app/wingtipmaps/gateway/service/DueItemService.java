package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.AircraftDueItem;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.DueItemDto;
import app.wingtipmaps.gateway.dto.DueItemRequest;
import app.wingtipmaps.gateway.repository.AircraftDueItemRepository;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** A pilot's airplane's due items -- ADs and the owner's other items --
 *  added, changed and taken out; empty where the airplane is not this
 *  pilot's, as its squawks are (SquawkService). */
@Service
public class DueItemService {

    private final AircraftService aircraft;
    private final AircraftDueItemRepository items;

    public DueItemService(AircraftService aircraft, AircraftDueItemRepository items) {
        this.aircraft = aircraft;
        this.items = items;
    }

    /** Each airplane's items, as kept: one query for them all; an
     *  airplane with none is not a key. */
    public Map<Long, List<AircraftDueItem>> of(Collection<Long> aircraftIds) {
        return aircraftIds.isEmpty()
                ? Map.of()
                : items.findByAircraftIdInOrderByIdAsc(aircraftIds).stream()
                        .collect(Collectors.groupingBy(i -> i.getAircraft().getId()));
    }

    public Optional<DueItemDto> add(Pilot pilot, Long aircraftId, DueItemRequest r) {
        return aircraft.get(pilot, aircraftId).map(a -> toDto(items.save(fill(new AircraftDueItem(a), r))));
    }

    public Optional<DueItemDto> update(Pilot pilot, Long aircraftId, Long id, DueItemRequest r) {
        return aircraft.get(pilot, aircraftId)
                .flatMap(a -> items.findByIdAndAircraftId(id, a.getId()))
                .map(i -> toDto(items.save(fill(i, r))));
    }

    /** @return true if an item was actually deleted */
    public boolean delete(Pilot pilot, Long aircraftId, Long id) {
        return aircraft.get(pilot, aircraftId)
                .flatMap(a -> items.findByIdAndAircraftId(id, a.getId()))
                .map(i -> {
                    items.delete(i);
                    return true;
                })
                .orElse(false);
    }

    private static AircraftDueItem fill(AircraftDueItem i, DueItemRequest r) {
        return i.set(
                r.kind(),
                Typed.words(r.title()),
                Typed.text(r.reference()),
                Typed.text(r.method()),
                r.dueOn(),
                r.dueAtHours());
    }

    public static DueItemDto toDto(AircraftDueItem i) {
        return new DueItemDto(
                i.getId(), i.getKind(), i.getTitle(), i.getReference(), i.getMethod(), i.getDueOn(), i.getDueAtHours());
    }
}
