import type { ReactNode } from "react";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { TEXT } from "../lib/text";
import { cn } from "cn";
import { errorIdOf } from "../lib/fieldError";

/**
 * A form's field as a grouped list's row holds it at its end (ListRow's
 * children), or a text box across the group: shadcn's Field round it,
 * and what is wrong with the value in its FieldError under it -- red, an
 * alert, by the field the pilot is looking at -- where the row's words
 * stay what the field is. A text box across the group (`wide`) carries its
 * `label` over it, the stock FieldLabel, so what it is stays in sight once
 * typed in, where a placeholder goes (WCAG 3.3.2), and its name is the
 * words seen (2.5.3).
 */
export default function RowField({
  id,
  error,
  wide,
  label,
  children,
}: {
  id: string;
  error: string | undefined;
  /** A text box across the group, its message at the start. */
  wide?: boolean;
  /** The words over a wide field, which name it. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={!!error || undefined} className={cn("gap-1", !wide && "w-auto items-end")}>
      {label && (
        <FieldLabel htmlFor={id} className={cn("font-normal text-muted-foreground", TEXT.note)}>
          {label}
        </FieldLabel>
      )}
      {children}
      {error && (
        <FieldError id={errorIdOf(id)} className={cn(!wide && "max-w-44 text-right")}>
          {error}
        </FieldError>
      )}
    </Field>
  );
}
