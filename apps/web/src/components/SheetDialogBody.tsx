import { useRef, type ReactElement, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import CloseButton from "./CloseButton";
import { PhoneSheet, PhoneSheetBody, PhoneSheetClose, PhoneSheetContent, PhoneSheetHeader, PhoneSheetTrigger } from "./PhoneSheet";
import { useIsMobile } from "../hooks/use-mobile";

/** What the dialog is for: Delete, Set, Sign in. */
interface SheetDialogAction {
  label: ReactNode;
  /** What it does; the dialog stays open until its caller closes it.
   *  Without it, and without a form, it only closes the dialog: OK. */
  onClick?: () => void;
  /** The id of the caller's form, which it then submits: Enter in a field
   *  does the same, though the button is in the title row. */
  form?: string;
  disabled?: boolean;
  /** Red, for what cannot be walked back. */
  destructive?: boolean;
  testId?: string;
}

/** The first thing to type in or press, where a sheet opens on its
 *  content rather than on its close: the address to sign in with. */
const FIRST = "input:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href]";

/**
 * Every box that asks something of the pilot over the page -- confirm a
 * delete, set an altitude, sign in, say something failed -- one way: in
 * the middle of the screen from `md` up (shadcn's AlertDialog for an
 * alert, its Dialog otherwise) and, on a phone, the floating sheet
 * (PhoneSheetContent) up from the screen's foot, as iOS asks from
 * the bottom of the screen (the sheet consolidation, 2026-10-27, where
 * four of them stood in the middle of a phone and three more each made
 * the switch their own way). A confirmation (`centered`, useConfirm's)
 * stays in the middle at every width, over the page, no card.
 *
 * Its title row is an iOS sheet's: the title and the app's close
 * (CloseButton) at its end; or, for a form (`cancel`), Cancel at its
 * start and the form's action at its end, as an iOS form sheet has them.
 * Otherwise the action is under what it asks, the width of the sheet --
 * on a phone only where it does something: an OK that only closes is the
 * close's job there.
 */
export default function SheetDialog({
  open,
  onOpenChange,
  title,
  description,
  alert = false,
  cancel = false,
  centered = false,
  action,
  more,
  trigger,
  size,
  testId,
  initialFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** An alert (role alertdialog): it waits for an answer, a tap beside it
   *  does not put it away from `md` up, and the way out takes the focus,
   *  so Enter never confirms unasked. */
  alert?: boolean;
  /** A form's Cancel, and the action beside the title on a phone. */
  cancel?: boolean;
  /** An alert in the middle of the screen at every width, as iOS's alert
   *  is (the owner, 2026-11-20: a confirmation "shouldn't open a new
   *  card"), not the phone's sheet from the foot. useConfirm's. */
  centered?: boolean;
  action?: SheetDialogAction;
  /** A further button: in the buttons' row from `md` up, under the
   *  content on a phone (an altitude's Reset). */
  more?: ReactNode;
  /** What opens it, where that is its own button (Sign in). */
  trigger?: ReactElement;
  /** The alert's width from `md` up: "sm" for a field or two. */
  size?: "default" | "sm";
  testId?: string;
  /** Where the focus goes as it opens, where that is not the default:
   *  the field to type a figure into, found in the sheet it is given.
   *  Nothing found, the default. */
  initialFocus?: (sheet: HTMLElement) => HTMLElement | null | undefined;
  children?: ReactNode;
}) {
  const onPhone = useIsMobile();
  const out = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const acts = !!action && (!!action.onClick || !!action.form);
  // A form's action, or a choice to make, is a button of its own; an OK
  // closes as the close does.
  const actionButton = (className?: string, small = false) =>
    action && (
      <Button
        type={action.form ? "submit" : "button"}
        form={action.form}
        size={small ? "sm" : "default"}
        variant={action.destructive ? "destructive" : "default"}
        disabled={action.disabled}
        onClick={action.form ? undefined : (action.onClick ?? (() => onOpenChange(false)))}
        className={className}
        data-testid={action.testId}
      >
        {action.label}
      </Button>
    );
  // Base UI's initialFocus: the element to focus, or true for its own way.
  const focus = () => {
    const box = sheet.current;
    if (!box) return true;
    const own = initialFocus?.(box);
    if (own) return own;
    // An alert's way out, as an alert focuses its Cancel; anything else
    // its first field or button, not the close it opens with now.
    const first = alert ? out.current : box.querySelector<HTMLElement>(`[data-dialog-body] :is(${FIRST})`);
    return first ?? true;
  };

  if (onPhone && !(alert && centered)) {
    return (
      <PhoneSheet open={open} onOpenChange={onOpenChange}>
        {trigger && <PhoneSheetTrigger render={trigger} />}
        <PhoneSheetContent
          ref={sheet}

          data-testid={testId}
          initialFocus={focus}
          // Only an alert's: an undefined role would take Base UI's "dialog" away.
          {...(alert ? { role: "alertdialog" } : {})}
        >
          <PhoneSheetHeader
            title={title}
            description={description}
            leading={
              cancel ? (
                <PhoneSheetClose render={<Button ref={out} type="button" variant="ghost" size="sm" className="-ml-2" />}>
                  Cancel
                </PhoneSheetClose>
              ) : undefined
            }
            end={cancel ? actionButton("-mr-1", true) : <PhoneSheetClose render={<CloseButton ref={out} data-testid="sheet-close" />} />}
          />
          <PhoneSheetBody data-dialog-body="" className="grid gap-4">
            {children}
            {more}
            {!cancel && acts && actionButton()}
          </PhoneSheetBody>
        </PhoneSheetContent>
      </PhoneSheet>
    );
  }

  if (alert) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        {trigger && <AlertDialogTrigger render={trigger} />}
        <AlertDialogContent ref={sheet} size={size} data-testid={testId} initialFocus={focus}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <div data-dialog-body="" className="contents">
            {children}
          </div>
          <AlertDialogFooter>
            {more}
            {(cancel || acts) && <AlertDialogCancel>Cancel</AlertDialogCancel>}
            {actionButton()}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      {/* No taller than the window, its title and buttons held and what is
          between them scrolled: a long form (the logbook's draft from a
          track, its reasons under each figure) ran off the window's top and
          foot, its Log out of reach of a click or a scroll. Centred, so as
          far from both edges as the larger of the status bar's and the home
          indicator's room, and a rem at the least. */}
      <DialogContent
        ref={sheet}
        data-testid={testId}
        initialFocus={focus}
        className="flex max-h-[calc(100dvh-2*max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom)))] flex-col"
      >
        <DialogHeader className="shrink-0">
          {/* The close at the title row's end, as a phone's sheet has it. */}
          <div className="flex items-center gap-2">
            <DialogTitle className="min-w-0 flex-1">{title}</DialogTitle>
            {!cancel && <DialogClose render={<CloseButton ref={out} className="-my-2 -mr-2" data-testid="dialog-close" />} />}
          </div>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && (
          <div data-dialog-body="" className="-mx-6 grid min-h-0 gap-4 overflow-y-auto px-6">
            {children}
          </div>
        )}
        {(more || cancel || action) && (
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {more}
            {cancel && <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>}
            {actionButton()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
