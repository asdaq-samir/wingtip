import { useState } from "react";
import { Bell, Share } from "lucide-react";
import { cn } from "cn";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { SheetCard } from "../../components/SheetCard";
import { CardAction } from "../../components/CardAction";
import { ACTION } from "../../lib/cardActions";
import { LINK } from "../../components/airplane/link";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { NumberField } from "../../components/ui/number-field";
import { FIGURE_WORDS } from "../../lib/airplane/figureWords";
import { TEXT } from "../../lib/text";
import { figureFormat, sourceWords } from "./profileModel";
import { EnduranceSection } from "./EnduranceSection";
import { useAirplaneProfile, type AirplaneProfileModel } from "./useAirplaneProfile";
import { FieldError } from "../../components/ui/field";
import PastFlights from "../plan/components/PastFlights";
import AircraftAlertMenu from "../plan/components/AircraftAlertMenu";
import { FavoriteTile } from "../../components/FavoriteTile";
import { CardTabPages, CardTabPanel } from "../../components/CardTabs";
import { CardTabBar, TabCount } from "../../components/CardTabBar";
import { CardPictures } from "../../components/CardPictures";
import { PhotoSlide } from "../../components/PictureSlides";
import { AirplaneFacts } from "../../components/airplane/AirplaneFacts";
import { useTabScroll } from "../../lib/tabScroll";
import AirplaneInfo from "./AirplaneInfo";
import { StatusLine } from "../../components/StatusBadge";

/** One figure: its name and where it comes from, its field (typed in place,
 *  kept as the pilot's when it changes), and Reset to book figure where
 *  the pilot's or the photographed page's stands over the book's. */
function FigureRow({ vm, row }: { vm: AirplaneProfileModel; row: AirplaneProfileModel["rows"][number] }) {
  const words = FIGURE_WORDS[row.key];
  const shown = row.key in vm.drafts ? (vm.drafts[row.key] ?? null) : row.value;
  const problem = vm.problems[row.key];
  return (
    <div data-figure={row.key}>
      <ListRow
        title={words.label}
        description={
          <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className={row.source == null ? "text-destructive-ink" : undefined} data-testid={`figure-source-${row.key}`}>
              {sourceWords(row.source)}
            </span>
            {row.resettable && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={LINK}
                disabled={vm.busy === row.key}
                onClick={() => vm.reset(row.key)}
                data-testid={`figure-reset-${row.key}`}
              >
                Reset to book figure
              </Button>
            )}
          </span>
        }
      >
        <span className="flex items-center gap-1.5">
          {/* React Aria's number field, read in the pilot's locale (a comma
              decimal is a decimal), taken as it is left. */}
          <NumberField
            value={shown}
            placeholder="—"
            formatOptions={figureFormat(row.key)}
            minValue={0}
            onChange={(value) => vm.change(row.key, value)}
            isDisabled={vm.busy === row.key}
            aria-label={`${words.label}, ${words.unit.replace(/^: /, "to ")}`}
            isInvalid={!!problem}
            className="h-8 w-24"
            inputClassName={cn("text-right", TEXT.row)}
            data-testid={`figure-${row.key}`}
          />
          <span className="w-10 text-muted-foreground">{words.unit}</span>
        </span>
      </ListRow>
      {problem && <FieldError className={cn("px-4 pb-2 text-destructive-ink", TEXT.detail)}>{problem}</FieldError>}
    </div>
  );
}

/** Its handbook's specifications page photographed and read (usePhotoRead):
 *  the figures found filled in, the page's words to check them by, and
 *  Save to keep them all. */
function PhotoRead({ vm }: { vm: AirplaneProfileModel }) {
  const { busy, words, problem, read } = vm.photo;
  const pending = words.length > 0 && Object.keys(vm.drafts).length > 0;
  return (
    <div className="flex flex-col gap-2">
      {/* React Aria's FileTrigger: the hidden file input, opened by the row. */}
      <FileTrigger
        acceptedFileTypes={["image/*"]}
        defaultCamera="environment"
        data-testid="profile-photo-input"
        onSelect={(files) => {
          const file = files?.[0];
          if (file) void read(file);
        }}
      >
        <ListGroup>
          <Pressable isDisabled={busy}>
            <ListRow title={busy ? "Reading the page…" : "Read from a Photo"} disabled={busy} />
          </Pressable>
        </ListGroup>
      </FileTrigger>
      <div className={cn("space-y-0.5 px-1", TEXT.detail)} role="status" data-testid="profile-photo-read">
        {problem && <p className="text-destructive-ink">{problem}</p>}
        {words.length > 0 && <p className="font-semibold">Read from the page: check each against it before saving.</p>}
        {words.map((w) => (
          <p key={w} className="text-muted-foreground">
            {w}
          </p>
        ))}
      </div>
      {pending && (
        <Button type="button" size="sm" className="self-end" onClick={vm.commitAll} data-testid="profile-photo-save">
          Save
        </Button>
      )}
    </div>
  );
}

/** The card's tabs, Flights first (the owner's P1, 2026-11-14). */
type ProfileTab = "flights" | "info" | "figures";

/**
 * An airplane's card, opened from any N-number and any airplane figure the
 * app shows (lib/airplane/profileStore), the pilot's own airplanes too: a
 * card in the map's sheet over the search, with its ✕, by the one card
 * rule (the owner, 2026-11-10). Laid out as the airport card is, at the
 * owner's pick of P1 ("Ok I take your rec", 2026-11-14; the canvas
 * https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253), and after Apple Maps'
 * place card as the airport card's C1 is (the owner the same day: "make
 * sure the airplane card looks similar to airport card"): its N-number and
 * the registry's make, model and year under it; Fly This, Follow, Favorite
 * and Share in one row; its one status line; its facts in a sideways strip
 * (AirplaneFacts); its photo as the airport card's pictures (CardPictures);
 * then the page of the tab picked in the glass bar floating at the card's
 * foot, Flights, Info and Figures (CardTabBar). Every figure stays editable
 * in place in Figures, a missing one asking there. Signed out, what is set
 * stays on this device. Its view model is useAirplaneProfile, the
 * airplane's own part useAirplaneCard.
 */
export default function AirplaneProfileSheet() {
  const vm = useAirplaneProfile();
  const { card } = vm;
  // Opened for a figure: on Figures; else on Flights. Each tab its own place in the scroll (useTabScroll).
  const [tab, setTab] = useState<ProfileTab>(vm.focus ? "figures" : "flights");
  const [, setTop] = useTabScroll(tab);
  const photo = card.photo;
  const src = photo ? (photo.thumbnail_large ?? photo.thumbnail) : null;
  return (
    <SheetCard
      title={vm.tail}
      // The registry's make, model and year under its name, as the airport card has its town there.
      description={card.line ?? vm.type ?? "Type not known"}
      onClose={vm.close}
      testId="airplane-profile"
      // On the figure it was opened for, where it was one.
      initialFocus={() => {
        const field = vm.focus ? document.querySelector<HTMLInputElement>(`[data-figure="${vm.focus}"] input`) : null;
        field?.scrollIntoView({ block: "center" });
        return field ?? true;
      }}
    >
      {/* One row of four, the first filled, as the airport card's (CardAction). Follow is the
          flight card's alerts -- takes off, lands, comes near -- and Favorite its star, both by
          the ICAO address the registry gives: greyed where it gives none. */}
      <div className="grid grid-cols-4 gap-2" data-testid="airplane-actions">
        <CardAction
          icon={<ACTION.flyHere.icon />}
          label={vm.flying ? "Flying This" : "Fly This"}
          spoken={vm.flying ? "Flying this airplane" : "Fly this airplane"}
          filled
          disabled={vm.flying}
          onClick={vm.fly}
          testId="fly-this-airplane"
        />
        {card.hex ? (
          <AircraftAlertMenu
            hex={card.hex}
            name={vm.tail}
            airborne={card.airborne}
            from={null}
            to={null}
            label="Follow"
            testId="airplane-follow"
          />
        ) : (
          <CardAction icon={<Bell />} label="Follow" disabled testId="airplane-follow" />
        )}
        <FavoriteTile on={card.starred} disabled={!card.kept} onToggle={card.toggleFavorite} testId="airplane-favorite" />
        <CardAction icon={<Share />} label="Share" onClick={card.share} testId="airplane-share" spoken={`Share ${vm.tail}`} />
      </div>
      {/* Its one status line under the actions, as the flight card's alerts line: in the air from
          the live find, else where its last flight ended, else none heard (airplaneStatus). */}
      <p
        role="status"
        className={cn("px-1 pt-3", card.status.problem ? "text-destructive-ink" : "text-muted-foreground", TEXT.detail)}
        data-testid="airplane-status"
      >
        {card.track ? (
          <Button type="button" variant="link" size="sm" className={LINK} onClick={card.track} data-testid="airplane-status-track">
            <StatusLine words={card.status} />
          </Button>
        ) : (
          <StatusLine words={card.status} />
        )}
      </p>
      <AirplaneFacts record={card.details?.registration ?? card.record} model={card.details?.model} testId="airplane-facts" />
      {/* Its photo once Planespotters.net answered with one, on its terms (docs/legal/credits.md):
          the photographer named on it, the picture a plain link to its page, its address used as
          given and never kept by the app. */}
      {photo && src && (
        <div className="pt-4">
          <CardPictures
            label={`${vm.tail}: its photo`}
            testId="airplane-pictures"
            slides={[
              {
                key: "photo",
                href: photo.link,
                label: `${vm.tail}'s photo on ${photo.source}`,
                testId: "airplane-photo-open",
                picture: (
                  <PhotoSlide
                    src={src}
                    alt={`The airplane, photographed by ${photo.photographer ?? "a Planespotters.net photographer"}`}
                    label={`${vm.tail}'s photo`}
                    credit={`© ${photo.photographer ?? "Photographer"} · ${photo.source}`}
                    testId="airplane-photo"
                    creditTestId="airplane-photo-credit"
                  />
                ),
              },
            ]}
          />
        </div>
      )}
      <CardTabPages
        tab={tab}
        onPick={setTab}
        top={setTop}
        bar={
          <CardTabBar<ProfileTab>
            testId="airplane-tab-bar"
            tabTestId="airplane-tab-"
            onPick={setTab}
            tabs={[
              {
                value: "flights",
                label: "Flights",
                hint: card.flightCount ? String(card.flightCount) : null,
                trail: card.flightCount ? <TabCount count={card.flightCount} testId="airplane-tab-count" /> : null,
              },
              { value: "info", label: "Info" },
              { value: "figures", label: "Figures" },
            ]}
          />
        }
      >
        <CardTabPanel value="flights">
          {/* Its flights (the owner, 2026-11-14: "How do I see the flights of airplane and play
              them?"): the flight card's own list, each ▶ its replay over this card. */}
          {card.hex ? (
            <PastFlights hex={card.hex} onOpen={card.openPast} untitled play />
          ) : (
            <ListGroup>
              <ListRow muted title="No flights to show: the FAA's registry gives no address for this N-number." />
            </ListGroup>
          )}
        </CardTabPanel>
        <CardTabPanel value="info">
          <AirplaneInfo record={card.record} details={card.details} detailsFailed={card.detailsFailed} />
        </CardTabPanel>
        <CardTabPanel value="figures">
          <ListGroup title="Figures">
            {vm.rows.map((row) => (
              <FigureRow key={row.key} vm={vm} row={row} />
            ))}
          </ListGroup>
          <EnduranceSection
            tail={vm.tail}
            usableGal={vm.rows.find((r) => r.key === "usable_fuel_gal")?.value ?? null}
            burnGph={vm.rows.find((r) => r.key === "fuel_burn_gph")?.value ?? null}
          />
          <PhotoRead vm={vm} />
        </CardTabPanel>
      </CardTabPages>
    </SheetCard>
  );
}
