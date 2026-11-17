import { Button as BaseButton } from "@base-ui/react/button";
import { cloneElement, useState, type ReactElement, type ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "cn";
import { loadPopups, usePopups } from "./popupsChunk";
import { PULL_DOWN_WORDS, pullDownName } from "./ui/menuLook";

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
}

/** The trigger as it is drawn before the Select is in: the same words and
 *  chevron, a tap asking for it. */
function PullDownStandIn<V extends string>({
  label,
  value,
  options,
  placeholder,
  testId,
  className,
  onClick,
}: Pick<PullDownProps<V>, "label" | "value" | "options" | "placeholder" | "testId" | "className"> & { onClick: () => void }) {
  const picked = options.find((o) => o.value === value);
  return (
    <BaseButton
      aria-label={pullDownName({ label, value, options, placeholder })}
      data-testid={testId}
      onClick={onClick}
      className={cn(PULL_DOWN_WORDS, className)}
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
 * picked in the tint with the up-and-down chevron, and a tap the list of
 * them, the picked one's checkmark on the left (the owner's "one pull-down
 * for every pick-one", 2026-10-27). Base UI's Select underneath since
 * 2026-11-17 (shadcn's, ui/select; the owner: stock over our own), where
 * it was a menu's radio items: a listbox to a screen reader and the
 * keyboard, its value in its trigger (Select.Value), its rows in the app's
 * one menu look (ui/menuLook). A caller's own trigger (`trigger`: a chip,
 * a tile, a glyph) is the Select's trigger as it is.
 */
export default function PullDown<V extends string>(props: PullDownProps<V>) {
  // The menu is on the popups' chunk (popupsChunk): until it is in, the
  // trigger alone, and a tap on it opens the menu once it is.
  const popups = usePopups();
  const [asked, setAsked] = useState(false);
  if (popups) return <popups.PullDownSelect {...props} defaultOpen={asked} />;
  const ask = () => {
    setAsked(true);
    void loadPopups();
  };
  const { trigger } = props;
  return trigger ? (
    cloneElement(trigger as ReactElement<{ onClick?: () => void }>, { onClick: ask })
  ) : (
    <PullDownStandIn
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
