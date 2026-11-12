#!/usr/bin/env node
// Stage 3's film, on the Mac itself (docs/STUDIO-PIPELINE.md): each ready
// crash draft opened in the Studio in a headless Chromium on the Mac's GPU,
// its export driven, the film saved, and the draft marked rendered. Not in
// Docker: a container on the Mac has no GPU, and MapLibre's 3D view at
// film quality needs one. Checked on this Mac (2026-11-12): Chromium's
// new headless (Playwright's `channel: "chromium"`) draws WebGL2 on ANGLE's
// Metal back end; the old chrome-headless-shell falls back to SwiftShader
// unless given --use-angle=metal and --enable-gpu, which are passed here
// too. A page that reports SwiftShader is refused rather than filmed slow.
//
//   node scripts/dev/studio-render.mjs              every ready draft, once
//   node scripts/dev/studio-render.mjs --sign-in    a window to sign in as the developer, once
//
// It needs Node (.tool-versions' nodejs, through mise) and apps/web's
// packages on the Mac (`npm ci` there: Playwright comes from them), and the
// stack up. The browser keeps its own profile, signed in once with
// --sign-in, in ~/Library/Application Support/Wingtip/studio-render.
// scripts/dev/launchd/app.wingtipmaps.studio-render.plist runs it every
// half hour once installed (docs/STUDIO-PIPELINE.md says how).
//
// Settings, from the environment:
//   WINGTIP_URL          the gateway the Studio is opened at (https://localhost:8443)
//   PLANNER_URL          the planner on loopback, for the list of drafts (http://127.0.0.1:8084)
//   STUDIO_RENDER_OUT    where the films are saved (~/Movies/Wingtip Studio)
//   STUDIO_RENDER_PRESET the export's presets, comma-separated ("draft-1080p,draft-1080p-layers")
//
// The export is the Studio's own (features/replay/export: MapLibre's
// setNow frame by frame, encoded with mediabunny), opened to this script
// through one entry (useRenderEntry):
//
//   window.__studioExport({ draftId, preset }): Promise<{ filename: string }>
//     makes the preset's video of the draft's whole track and hands it to
//     the browser as a download named `filename`; rejects with the reason
//     where it cannot be made.
//
// Opened at /app/studio?draft=<id>&render=1, the Studio loads the draft's
// track (useDrafts) and the weather then, and its export panel sets
// window.__studioExport once the map is ready. Each preset of
// STUDIO_RENDER_PRESET is made in turn ("draft-1080p", the finished 16:9
// film; "draft-1080p-layers", its layers zip), then the draft is marked
// rendered. A draft of the place alone ("No ADS-B track") has no film to
// make and is left for a person.

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(join(repo, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const WINGTIP_URL = (process.env.WINGTIP_URL ?? "https://localhost:8443").replace(/\/+$/, "");
const PLANNER_URL = (process.env.PLANNER_URL ?? "http://127.0.0.1:8084").replace(/\/+$/, "");
const OUT = process.env.STUDIO_RENDER_OUT ?? join(homedir(), "Movies", "Wingtip Studio");
const PRESETS = (process.env.STUDIO_RENDER_PRESET ?? "draft-1080p,draft-1080p-layers")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const PROFILE = join(homedir(), "Library", "Application Support", "Wingtip", "studio-render");
// How long a film may take to make, and the page to be ready.
const EXPORT_TIMEOUT_MS = 20 * 60_000;
const READY_TIMEOUT_MS = 90_000;

const args = new Set(process.argv.slice(2));

function browser(headless) {
  mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    channel: "chromium",
    headless,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
    // The presets' 16:9; the export lays the map out at the video's own size.
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
}

/** The WebGL renderer the page draws with, to refuse a software one. */
async function renderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "none";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
}

async function readyDrafts() {
  const resp = await fetch(`${PLANNER_URL}/api/studio/drafts`);
  if (!resp.ok) throw new Error(`the planner's drafts: HTTP ${resp.status}`);
  const ready = (await resp.json()).filter((d) => d.status === "ready" && d.kit_at);
  for (const d of ready.filter((d) => d.track !== "adsb"))
    console.log(`studio-render: ${d.id} has no ADS-B track; no film, left for a person`);
  return ready.filter((d) => d.track === "adsb");
}

async function render() {
  const drafts = await readyDrafts();
  if (drafts.length === 0) {
    console.log("studio-render: no ready drafts");
    return 0;
  }
  mkdirSync(OUT, { recursive: true });
  const context = await browser(true);
  try {
    const page = await context.newPage();
    for (const draft of drafts) {
      await page.goto(`${WINGTIP_URL}/app/studio?draft=${encodeURIComponent(draft.id)}&render=1`);
      const gpu = await renderer(page);
      if (/swiftshader|llvmpipe|software|none/i.test(gpu)) {
        console.error(`studio-render: the page draws with ${gpu}, not the GPU; nothing filmed`);
        return 1;
      }
      try {
        await page.waitForFunction(() => typeof window.__studioExport === "function", null, { timeout: READY_TIMEOUT_MS });
      } catch {
        console.error(`studio-render: ${draft.id}: the Studio's export did not open (its track, the map or the sign-in); skipped`);
        continue;
      }
      const saved = [];
      try {
        for (const preset of PRESETS) {
          const downloaded = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT_MS });
          // Its rejection is the export's, said below, not an unhandled one.
          downloaded.catch(() => {});
          const made = await page.evaluate(({ draftId, preset }) => window.__studioExport({ draftId, preset }), {
            draftId: draft.id,
            preset,
          });
          const file = await downloaded;
          const path = join(OUT, `${draft.id}-${made?.filename ?? file.suggestedFilename()}`);
          await file.saveAs(path);
          saved.push(path);
        }
      } catch (err) {
        console.error(`studio-render: ${draft.id}: ${err instanceof Error ? err.message : String(err)}; not marked rendered`);
        continue;
      }
      await page.evaluate((id) => window.__studioDraftRendered?.(id), draft.id);
      console.log(
        `studio-render: ${draft.id} (${draft.aircraft ?? "aircraft"}, ${draft.city}, ${draft.state}) -> ${saved.join(", ")} on ${gpu}`,
      );
    }
    return 0;
  } finally {
    await context.close();
  }
}

async function signIn() {
  const context = await browser(false);
  const page = await context.newPage();
  await page.goto(`${WINGTIP_URL}/app/studio`);
  console.log("studio-render: sign in as the developer in the window, then close it");
  await page.waitForEvent("close", { timeout: 0 });
  await context.close();
  return 0;
}

const run = args.has("--sign-in") ? signIn : render;
process.exit(await run());
