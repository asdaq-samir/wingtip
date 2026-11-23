import { useId, useState } from "react";
import { errorIdOf, invalidProps } from "../../lib/fieldError";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FieldHit from "../../components/FieldHit";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api/client";
import type { Pilot } from "../../lib/api/types";
import { pilotQuery } from "../../lib/queryClient";
import { AccountGroup } from "./AccountMenu";
import { AvatarPhoto } from "./AvatarPhoto";
import { NameFieldRow } from "./NameFieldRow";

// The server's own limits (PilotContactRequest): a number is figures and
// the marks one is written with, a home base an airport identifier.
const PHONE = /^[0-9+()\-. ]{0,24}$/;
const HOME_BASE = /^([A-Za-z0-9]{2,11})?$/;

/**
 * You's Pilot Details: their photo (AvatarPhoto), the role's menu (AccountGroup), then what a flight plan asks of the pilot in command
 * (FAA Form 7233-4, item 19 C/) -- their name as their certificate gives
 * it, the one an endorsement names them by too (Checkride's), and their
 * contact, "including telephone number", good at the ETA in case search
 * and rescue is needed (AIM Appendix 4) -- with the home base the
 * domestic form asks beside them (FAA Form 7233-1, block 14). The Brief's
 * flight plan fills item 19 from them. Each is saved as it is left, as
 * the Checkride's name is; what is wrong is said under its label.
 */
export default function PilotPage() {
  const { data: pilot } = useQuery(pilotQuery);
  // Their photo first, as Contacts heads a card, then the role's menu
  // (AccountGroup), then the fields, keyed on the pilot, so they start
  // from what is saved once it is known.
  return (
    <div className="space-y-5">
      {pilot && <AvatarPhoto pilot={pilot} />}
      <AccountGroup />
      {pilot && <PilotFields key={pilot.id} pilot={pilot} />}
    </div>
  );
}

function PilotFields({ pilot }: { pilot: Pilot }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [name, setName] = useState(pilot.fullName ?? "");
  const [phone, setPhone] = useState(pilot.phone ?? "");
  const [home, setHome] = useState(pilot.homeBase ?? "");
  const keep = (next: Pilot) => queryClient.setQueryData(pilotQuery.queryKey, next);
  const saveName = useMutation({
    mutationFn: (n: string) => api.training.setName(n),
    onSuccess: (training) => {
      queryClient.setQueryData(["training"], training);
      queryClient.setQueryData(pilotQuery.queryKey, (p) => (p ? { ...p, fullName: training.fullName } : p));
    },
  });
  const saveContact = useMutation({ mutationFn: api.setContact, onSuccess: keep });

  const phoneWrong = !PHONE.test(phone.trim()) ? "Figures, spaces and + ( ) - . only" : undefined;
  const homeWrong = !HOME_BASE.test(home.trim()) ? "An airport identifier, as KMSN or C81" : undefined;
  const contact = () => {
    if (phoneWrong || homeWrong) return;
    if (phone.trim() === (pilot.phone ?? "") && home.trim().toUpperCase() === (pilot.homeBase ?? "")) return;
    saveContact.mutate({ phone: phone.trim(), homeBase: home.trim() });
  };
  // Said under its title with the id its field is described by, so a reader
  // says the two together (WCAG 3.3.1).
  const problem = (field: string, message?: string | null) =>
    message ? (
      <span id={errorIdOf(field)} className="text-destructive">
        {message}
      </span>
    ) : undefined;

  return (
    <section aria-label="Pilot details">
      <ListGroup title="For Your Flight Plans">
        <NameFieldRow
          id={`${id}-name`}
          title="Name"
          description={problem(`${id}-name`, saveName.error?.message) ?? "As on your pilot certificate"}
          placeholder="Avery B. Pilot"
          value={name}
          saved={pilot.fullName}
          onChange={setName}
          onSave={saveName.mutate}
          testId="pilot-name"
          error={saveName.error?.message}
          className="h-8 w-44 text-right sm:w-56"
        />
        <ListRow
          id={`${id}-phone`}
          title="Phone"
          description={problem(`${id}-phone`, phoneWrong ?? saveContact.error?.message) ?? "One that reaches you at your ETA"}
        >
          <FieldHit htmlFor={`${id}-phone`}>
            <Input
              id={`${id}-phone`}
              type="tel"
              value={phone}
              placeholder="608-555-0100"
              maxLength={24}
              className="h-8 w-44 text-right sm:w-56"
              autoComplete="tel"
              inputMode="tel"
              {...invalidProps(`${id}-phone`, phoneWrong ?? saveContact.error?.message)}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={contact}
              data-testid="pilot-phone"
            />
          </FieldHit>
        </ListRow>
        <ListRow id={`${id}-home`} title="Home Base" description={problem(`${id}-home`, homeWrong)}>
          <FieldHit htmlFor={`${id}-home`}>
            <Input
              id={`${id}-home`}
              value={home}
              placeholder="KMSN"
              maxLength={11}
              className="h-8 w-32 text-right font-mono uppercase"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              {...invalidProps(`${id}-home`, homeWrong)}
              onChange={(e) => setHome(e.target.value)}
              onBlur={contact}
              data-testid="pilot-home-base"
            />
          </FieldHit>
        </ListRow>
      </ListGroup>
    </section>
  );
}
