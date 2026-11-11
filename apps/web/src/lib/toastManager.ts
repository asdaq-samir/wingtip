import { Toast } from "@base-ui/react/toast";

/**
 * The app's Base UI toast managers, which lib/toast's calls reach and
 * the Toaster's Providers listen to (components/ui/toast). On a chunk of
 * their own with the Toaster (lib/toast fetches it at the first toast),
 * so Base UI's Toast is not in the first load.
 *
 * Two, as Base UI's docs keep stacked and anchored toasts apart: the
 * stack at the screen's edge (progress, an Undo), and the confirmations
 * anchored to the control that made them ("Copied" by the Copy).
 */
export const toastManager = Toast.createToastManager();
export const anchoredManager = Toast.createToastManager();
