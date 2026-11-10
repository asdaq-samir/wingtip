import { Toast } from "@base-ui/react/toast";

/**
 * The app's one Base UI toast manager, which lib/toast's calls reach and
 * AppToaster's Provider listens to. On a chunk of its own with the Toaster
 * (lib/toast fetches it at the first toast), so Base UI's Toast is not in
 * the first load.
 */
export const toastManager = Toast.createToastManager();
