import { build, type Plugin } from "vite";

/**
 * The connector's live view built with the app, as one more file of its
 * build (claude-view.html, vite.claude-view.config.ts): emitted into the
 * app's bundle, so it is staged, published, compressed and served as the
 * app's own files are (publishBuild, the gateway's /app/**), at every
 * build of the watch too, and the planner reads it from there for its
 * MCP App (services/planner/app/mcp/view_resource). Built apart because
 * it is one self-contained page, where the app is split in chunks.
 */
export const claudeView: Plugin = {
  name: "claude-view",
  apply: "build",
  async generateBundle() {
    const { claudeViewConfig } = await import("../vite.claude-view.config.ts");
    const built = await build(claudeViewConfig);
    const outputs = (Array.isArray(built) ? built : [built]).flatMap((b) => ("output" in b ? b.output : []));
    const page = outputs.find((o) => o.fileName === "claude-view.html");
    if (!page || page.type !== "asset") throw new Error("The live view's build made no claude-view.html");
    this.emitFile({ type: "asset", fileName: "claude-view.html", source: page.source });
  },
};
