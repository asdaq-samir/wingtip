import { useState } from "react";
import type { MapPin } from "lucide-react";
import { cn } from "cn";
import { SearchField, SearchResults } from "./PanelCapsule";
import { TEXT } from "../lib/text";
import type { RecentAirport } from "../lib/preferences";

/** One airport to pick, as the first flight's card asks for one: the
 *  search bar's field and, while something is typed, the airports that
 *  answer it (PanelCapsule); the one picked shown in the
 *  field as "Madison, KMSN", its results put away. */
export default function AirportField({
  label,
  placeholder,
  icon,
  picked,
  onPick,
  testId,
}: {
  label: string;
  placeholder: string;
  icon?: typeof MapPin;
  picked: RecentAirport | null;
  onPick: (airport: RecentAirport | null) => void;
  testId: string;
}) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const value = picked ? `${picked.municipality ? `${picked.municipality}, ` : ""}${picked.ident}` : typed;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn("px-1 text-muted-foreground", TEXT.note)}>{label}</span>
      <SearchField
        value={value}
        placeholder={placeholder}
        label={label}
        testId={testId}
        icon={icon}
        onChange={(v) => {
          onPick(null);
          setTyped(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onCancel={() => setOpen(false)}
        onSubmit={() => undefined}
        onClear={() => {
          onPick(null);
          setTyped("");
        }}
      />
      {open && !picked && typed.trim() && (
        <div className="max-h-56 overflow-y-auto" data-testid={`${testId}-results`}>
          <SearchResults
            query={typed}
            onPick={(a) => {
              onPick(a);
              setTyped("");
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
