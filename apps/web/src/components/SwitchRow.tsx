import { useId, type ReactNode } from "react";
import { ListRow } from "./GroupedList";
import { Switch } from "./ui/switch";

/** A list's on-or-off row, as iOS's Settings has one: its title, an
 *  optional line under it, and the stock switch at its end, whose state
 *  reads at a glance -- where the map's layers had a "Show" pill that
 *  looked the same on and off (the UI audit, 2026-11-09). The title is
 *  the switch's label. */
export default function SwitchRow({ title, description, on, onChange, testId, disabled }: {
  title: string;
  description?: ReactNode;
  on: boolean;
  onChange: (on: boolean) => void;
  testId: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <ListRow id={id} title={title} description={description}>
      <Switch id={id} checked={on} onCheckedChange={onChange} disabled={disabled} data-testid={testId} />
    </ListRow>
  );
}
