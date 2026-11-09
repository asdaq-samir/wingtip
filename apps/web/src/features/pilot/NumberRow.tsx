import type { UseFormRegisterReturn } from "react-hook-form";
import FieldHit from "../../components/FieldHit";
import { ListRow } from "../../components/GroupedList";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "../../components/ui/input-group";

/** One of the aircraft form's figures: its label at the start, the
 *  number at the end with its unit inside the field, and what is wrong
 *  with it under the label. `name` is the accessible name, the phase
 *  and the unit in full ("Climb TAS in knots"). */
export default function NumberRow({
  id,
  title,
  unit,
  placeholder,
  name,
  field,
  error,
}: {
  id: string;
  title: string;
  unit: string;
  placeholder: string;
  name: string;
  field: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <ListRow id={id} title={title} description={error ? <span className="text-destructive">{error}</span> : undefined}>
      <FieldHit htmlFor={id}>
        <InputGroup className="h-8 w-32">
          <InputGroupInput
            id={id}
            {...field}
            placeholder={placeholder}
            className="text-right"
            aria-label={name}
            inputMode="decimal"
            aria-invalid={!!error}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </FieldHit>
    </ListRow>
  );
}
