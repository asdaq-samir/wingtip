import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import FieldHit from "../../components/FieldHit";
import { ListRow } from "../../components/GroupedList";
import { NumberField } from "../../components/ui/number-field";

/** One of the aircraft form's figures: its label at the start, the
 *  number at the end with its unit inside the field, and what is wrong
 *  with it under the label. `name` is the accessible name, the phase
 *  and the unit in full ("Climb TAS in knots"). React Aria's number
 *  field, the form's value its text as before ("" for none). */
export default function NumberRow<T extends FieldValues>({
  id,
  title,
  unit,
  placeholder,
  name,
  control,
  field,
  error,
}: {
  id: string;
  title: string;
  unit: string;
  placeholder: string;
  name: string;
  control: Control<T>;
  /** The form's field it is. */
  field: Path<T>;
  error?: string;
}) {
  return (
    <ListRow id={id} title={title} description={error ? <span className="text-destructive">{error}</span> : undefined}>
      <FieldHit htmlFor={id}>
        <Controller
          control={control}
          name={field}
          render={({ field: f }) => (
            <NumberField
              id={id}
              className="h-8 w-32"
              inputClassName="text-right"
              placeholder={placeholder}
              aria-label={name}
              unit={unit}
              isInvalid={!!error}
              value={f.value === "" || f.value == null ? null : Number(f.value)}
              onChange={(v) => f.onChange(v == null ? "" : String(v))}
              onBlur={f.onBlur}
            />
          )}
        />
      </FieldHit>
    </ListRow>
  );
}
