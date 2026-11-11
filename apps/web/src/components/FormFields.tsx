import type { ComponentProps } from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { DateField } from "./ui/date-field";
import { NumberField } from "./ui/number-field";
import { ariaInvalid } from "./ui/ariaInvalid";

/** The form's field, and the message of what is wrong with it, said by
 *  the field (ariaInvalid) where it has an id. */
type Bound<F extends FieldValues> = { control: Control<F>; name: Path<F>; error?: string };

/** React Aria's DateField bound to a react-hook-form field holding an ISO
 *  day ("" for none): a Controller, as a segmented field cannot be
 *  register()ed. Its ref to the form is the field's first segment, so
 *  the form's own focus on the first field in error (shouldFocusError)
 *  lands in it. */
export function FormDateField<F extends FieldValues>({
  control,
  name,
  error,
  ...props
}: Bound<F> & Omit<ComponentProps<typeof DateField>, "value" | "onChange" | "onBlur">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DateField
          {...props}
          {...(props.id ? ariaInvalid(props.id, error) : {})}
          ref={(box: HTMLDivElement | null) =>
            field.ref(box && { focus: () => box.querySelector<HTMLElement>('[role="spinbutton"]')?.focus() })
          }
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

/** React Aria's NumberField bound to a react-hook-form field holding the
 *  figure as typed text ("" for none), as the forms' schemas read it. */
export function FormNumberField<F extends FieldValues>({
  control,
  name,
  error,
  ...props
}: Bound<F> & Omit<ComponentProps<typeof NumberField>, "value" | "onChange" | "onBlur">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <NumberField
          {...props}
          {...(props.id ? ariaInvalid(props.id, error) : {})}
          value={field.value === "" || field.value == null ? null : Number(field.value)}
          onChange={(v) => field.onChange(v == null ? "" : String(v))}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}
