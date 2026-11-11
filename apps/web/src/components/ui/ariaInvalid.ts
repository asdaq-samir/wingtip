import { errorIdOf } from "../../lib/fieldError";

/** invalidProps (lib/fieldError) for React Aria's fields, which take
 *  `isInvalid` where a native field takes aria-invalid: marked invalid,
 *  and described by the message under it (RowField). */
export function ariaInvalid(id: string, error: string | undefined) {
  return { isInvalid: !!error, "aria-describedby": error ? errorIdOf(id) : undefined };
}
