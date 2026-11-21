import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api/client";
import { pilotQuery } from "../../lib/queryClient";
import { squarePhoto } from "./squarePhoto";

/**
 * Pilot Details' photo (AvatarPhoto): a photo picked from Photos or the
 * files, cropped square and scaled down here (squarePhoto) and kept by the
 * gateway (api.setAvatar), or taken out. Either asks for the pilot again,
 * whose avatarUrl then names the new photo or none, so every avatar shows
 * it. What went wrong is said under the buttons, in place.
 */
export function useAvatarPhoto() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: pilotQuery.queryKey });
  const choose = useMutation({ mutationFn: async (file: Blob) => api.setAvatar(await squarePhoto(file)), onSuccess: refresh });
  const remove = useMutation({ mutationFn: api.removeAvatar, onSuccess: refresh });
  const failed = choose.error ?? remove.error;
  return {
    choose: (file: Blob) => {
      remove.reset();
      choose.mutate(file);
    },
    remove: () => {
      choose.reset();
      remove.mutate();
    },
    busy: choose.isPending || remove.isPending,
    problem: failed ? describeError(failed, "The photo was not saved.") : null,
  };
}
