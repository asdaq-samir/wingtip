import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Plugin } from "vite";

// Under docker-compose.yml's web-build watch, VITE_PUBLISH_DIR names the
// directory the gateway serves (apps/web/dist). A phone that loaded the
// page while vite was writing into it got an index.html whose chunks were
// not all there yet -- "Importing a module script failed", and the page's
// "Part of the app didn't load" (2026-11-08) -- so a build is written
// whole into STAGING first, which vite empties at every build, and only
// then moved into the served directory a file at a time by rename, which
// a reader sees either before or after, never half done: the hashed
// chunks first, which nothing yet names, then the service worker, and
// index.html last. The files of builds replaced within the last day stay
// beside them, for pages already open that have yet to load a lazy chunk
// (main.tsx reloads a page whose chunk has gone, on vite:preloadError);
// PUBLISHED lists each build's files and when it was replaced. The service
// worker's precache is this build's files alone, since STAGING holds
// nothing else. Unset (the image's build, CI), vite writes dist as usual.
export const publishDir = process.env.VITE_PUBLISH_DIR;

export const STAGING = ".dist-next";
const PUBLISHED = ".published.json";
// A day, not an hour: a page left open overnight on the phone asked for
// a lazy chunk the next morning that had gone, and fell to "Part of the
// app didn't load" (the owner's screenshot, 2026-11-10).
const STALE_MS = 24 * 60 * 60 * 1000;
type Published = { files: string[]; replacedAt?: number }[];

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)));
}

// What a page asks for first goes in last: index.html names the entry
// chunk, and the service worker names every file it precaches.
const moveOrder = (file: string) =>
  file === "index.html" ? 2 : /^(sw\.js|registerSW\.js|manifest\.webmanifest|[^/]+\.html)$/.test(file) ? 1 : 0;

function publishBuild(staging: string, served: string, now = Date.now()) {
  const files = filesUnder(staging).sort((a, b) => moveOrder(a) - moveOrder(b));
  if (files.length === 0) return;
  const ledger = join(served, PUBLISHED);
  // The first build into a directory without a ledger: whatever is there
  // is the build this one replaces.
  let builds: Published = existsSync(ledger) ? JSON.parse(readFileSync(ledger, "utf8")) : [{ files: filesUnder(served) }];
  for (const file of files) {
    mkdirSync(dirname(join(served, file)), { recursive: true });
    renameSync(join(staging, file), join(served, file));
  }
  for (const build of builds) build.replacedAt ??= now;
  builds = [...builds.filter((b) => now - (b.replacedAt ?? now) < STALE_MS), { files }];
  const keep = new Set(builds.flatMap((b) => b.files));
  for (const file of filesUnder(served)) {
    if (file !== PUBLISHED && !keep.has(file)) rmSync(join(served, file));
  }
  writeFileSync(`${ledger}.tmp`, JSON.stringify(builds));
  renameSync(`${ledger}.tmp`, ledger);
}

// After every other plugin's closeBundle, vite-plugin-pwa's (which writes
// the service worker) included, at every build of the watch.
export const publish: Plugin = {
  name: "publish-build",
  apply: "build",
  closeBundle: {
    order: "post",
    sequential: true,
    handler(error?: Error) {
      if (!publishDir || error) return;
      publishBuild(STAGING, publishDir);
    },
  },
};
