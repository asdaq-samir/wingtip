/** The replay core every page shares (the owner, 2026-11-12: "all of them
 *  benefit each other"): the track model, the timeline, the cameras on the
 *  3D view and their keyframes, the data block, the radio and its
 *  captions, and the video export, over the map's one replay clock
 *  (lib/replay/clock).
 *
 *  TODO(claude/studio): the airplane at its altitude in 3D, a deck.gl
 *  ScenegraphLayer (a glTF model, turned to its track and pitched to its
 *  climb) drawn through @deck.gl/maplibre once that branch lands, here
 *  beside ReplayCameraGl; the export's drawAirplane (export/mapFrames)
 *  then goes, as deck.gl draws into the map's own canvas. */
export { ReplayTimeline } from "./ReplayTimeline";
export { DataBlock } from "./DataBlock";
export { default as ReplayCameraGl } from "./camera/ReplayCameraGl";
export { CameraMenu } from "./camera/CameraMenu";
export { resetReplayCamera, setReplayCamera } from "./camera/cameraStore";
export { dropAudio } from "./audio/audioStore";
export { useExporting } from "./export/exportStore";
export { ExportMapGl } from "./export/ExportMapGl";
/** The Studio's panels -- keyframes, the radio, captions, the video
 *  export -- on a chunk of their own, with wavesurfer.js. */
export const loadStudioParts = () => import("./studioParts");
export { alongAt, readyTrack, sampleAt, type AltitudeKind, type ReplayTrack } from "./track";
export { loadReplay, STUDIO_SPEEDS, toggleReplay } from "./useReplay";
