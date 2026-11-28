package app.wingtipmaps.gateway.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/** A logbook entry as its form sends it -- POST/PUT /api/logbook. The
 *  hours and landings are none or more; the text no longer than its
 *  columns (V12). The training columns (V13) and the instrument ones
 *  (V20) are none when not sent; so are those of an entry drawn from
 *  the app's track (V34): its air time, its touch-and-goes, that it came
 *  from a track and the saved flight it was flown as (the pilot's own,
 *  else none kept); and the airplane's category, class and tailwheel
 *  and the full-stop landings (V57), which passenger currency is judged
 *  by (14 CFR 61.57(a)(1)), none where not said. */
public record LogbookEntryRequest(
        @NotNull(message = "flownOn is required") LocalDate flownOn,

        @Size(max = 16, message = "aircraft must be at most 16 characters") @Nullable
        String aircraft,

        @Size(max = 16, message = "aircraftType must be at most 16 characters") @Nullable
        String aircraftType,

        @Size(max = 120, message = "route must be at most 120 characters") @Nullable
        String route,

        @PositiveOrZero(message = "totalHours must be zero or more")
        @Max(value = 24, message = "totalHours must be a day at most")
        double totalHours,

        @PositiveOrZero(message = "nightHours must be zero or more")
        double nightHours,

        @PositiveOrZero(message = "crossCountryHours must be zero or more")
        double crossCountryHours,

        @PositiveOrZero(message = "dayLandings must be zero or more")
        int dayLandings,

        @PositiveOrZero(message = "nightLandings must be zero or more")
        int nightLandings,

        @Size(max = 500, message = "remarks must be at most 500 characters") @Nullable
        String remarks,

        @PositiveOrZero(message = "dualHours must be zero or more")
        double dualHours,

        @PositiveOrZero(message = "soloHours must be zero or more")
        double soloHours,

        @PositiveOrZero(message = "instrumentHours must be zero or more")
        double instrumentHours,

        @PositiveOrZero(message = "toweredLandings must be zero or more")
        int toweredLandings,

        @PositiveOrZero(message = "distanceNm must be zero or more")
        double distanceNm,

        @PositiveOrZero(message = "longestLegNm must be zero or more")
        double longestLegNm,

        @PositiveOrZero(message = "approaches must be zero or more")
        int approaches,

        boolean holding,
        boolean tracking,

        @PositiveOrZero(message = "airHours must be zero or more")
        double airHours,

        @PositiveOrZero(message = "touchAndGoes must be zero or more")
        int touchAndGoes,

        boolean fromTrack,
        @Nullable Long flightId,

        @Schema(description = "14 CFR 61.5 category, \"Airplane\"; none where not said (61.57(a)(1))")
        @Size(max = 20, message = "category must be at most 20 characters")
        @Nullable
        String category,

        @Schema(description = "14 CFR 61.5 class, \"Single-engine land\"; none where not said (61.57(a)(1))")
        @Size(max = 24, message = "aircraftClass must be at most 24 characters")
        @Nullable
        String aircraftClass,

        @Schema(description = "A tailwheel airplane (61.57(a)(1)(ii)); none where not said") @Nullable
        Boolean tailwheel,

        @Schema(description = "Landings to a full stop, day and night; none where not said (61.57(a)(1)(ii))")
        @PositiveOrZero(message = "fullStopLandings must be zero or more")
        @Nullable
        Integer fullStopLandings) {}
