import type { ReactNode } from "react";
import FieldHit from "../../components/FieldHit";
import { ListRow } from "../../components/GroupedList";
import { Input } from "../../components/ui/input";

/** The pilot's name as their certificate gives it, a row with its field at
 *  the right, saved when the field is left with a changed name (the pilot's
 *  details, the student's Your instructor). `saved` is the name as kept. */
export function NameFieldRow({
  id,
  title,
  description,
  placeholder,
  value,
  saved,
  onChange,
  onSave,
  testId,
  className,
}: {
  id: string;
  title: string;
  description: ReactNode;
  placeholder: string;
  value: string;
  saved: string | null | undefined;
  onChange: (name: string) => void;
  onSave: (name: string) => void;
  testId: string;
  className: string;
}) {
  return (
    <ListRow id={id} title={title} description={description}>
      <FieldHit htmlFor={id}>
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          maxLength={120}
          className={className}
          autoComplete="name"
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          onBlur={() => {
            if (value.trim() && value.trim() !== saved) onSave(value.trim());
          }}
        />
      </FieldHit>
    </ListRow>
  );
}
