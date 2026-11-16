import { Button as BaseButton } from "@base-ui/react/button";
import { cloneElement, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { loadPopups, usePopups } from "./popupsChunk";

/** One of a pull-down's choices. */
export interface PullDownOption<V extends string> {
  value: V;
  /** Its row in the menu, and the trigger's words while it is the one. */
  label: ReactNode;
  /** Its words to a screen reader where the label is more than words (a
   *  picture beside them). */
  text?: string;
  testId?: string;
  /** A group's band after it. */
  apart?: boolean;
}

/** A pull-down's props. */
export interface PullDownProps<V extends string> {
  /** What is picked, to a screen reader: "Time aloft", said with the one
   *  picked ("Time aloft: 1 h"). */
  label: string;
  /** The one picked; one not among the options shows the placeholder. */
  value: V | "";
  options: PullDownOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  /** The trigger's. */
  testId?: string;
  align?: "start" | "center" | "end";
  /** A trigger of the caller's own -- a chip, a glyph -- in place of the
   *  tinted words; it says its own name. */
  trigger?: ReactElement;
  /** The tinted words' trigger's. */
  className?: string;
  contentClassName?: string;
  /** Before the choices, a band under it. */
  top?: ReactNode;
}

/** The tinted words with the up-and-down chevron: the trigger, unless the
 *  caller gives its own. */
export function PullDownWords<V extends string>({
  label,
  value,
  options,
  placeholder,
  testId,
  className,
  ...button
}: Pick<PullDownProps<V>, "label" | "value" | "options" | "placeholder" | "testId" | "className"> & ComponentProps<"button">) {
  const picked = options.find((o) => o.value === value);
  const words = picked ? (picked.text ?? (typeof picked.label === "string" ? picked.label : picked.value)) : (placeholder ?? "");
  return (
    // Its 44-point area a pseudo-element round the words, never a bigger
    // button (index.css's rule for every control).
    <BaseButton
      aria-label={`${label}: ${words}`}
      data-testid={testId}
      {...button}
      className={cn(
        "relative inline-flex min-w-0 items-center gap-1 rounded-sm text-tint outline-none",
        // Eleven over and under the words' 22, 44 in all.
        "after:absolute after:-inset-x-2 after:-inset-y-[11px] after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
        "[&_svg]:shrink-0",
        TEXT.row,
        className,
      )}
    >
      <span className={cn("flex min-w-0 items-center gap-1.5 truncate", !picked && "text-muted-foreground")}>
        {picked?.label ?? placeholder}
      </span>
      <ChevronsUpDown className="size-4" aria-hidden="true" />
    </BaseButton>
  );
}

/**
 * Every pick-one choice in the app, as iOS's pull-down button is: the one
 * picked in the tint with the up-and-down chevron, and a tap the menu of
 * them, the picked one's checkmark on the left (the owner's "one pull-down
 * for every pick-one", 2026-10-27). It was three things -- a Select
 * with its own list, radio items in a DropdownMenu, and the procedures'
 * menu -- each looking its own. The stock DropdownMenu's radio group
 * underneath, so it is a menu to a screen reader and the keyboard, its
 * look the app's one menu look (ui/menuLook).
 */
export default function PullDown<V extends string>(props: PullDownProps<V>) {
  // The menu is on the popups' chunk (popupsChunk): until it is in, the
  // trigger alone, and a tap on it opens the menu once it is.
  const popups = usePopups();
  const [asked, setAsked] = useState(false);
  if (popups) return <popups.PullDownMenu {...props} defaultOpen={asked} />;
  const ask = () => {
    setAsked(true);
    void loadPopups();
  };
  const { trigger } = props;
  return trigger ? (
    cloneElement(trigger as ReactElement<{ onClick?: () => void }>, { onClick: ask })
  ) : (
    <PullDownWords
      label={props.label}
      value={props.value}
      options={props.options}
      placeholder={props.placeholder}
      testId={props.testId}
      className={props.className}
      onClick={ask}
    />
  );
}
