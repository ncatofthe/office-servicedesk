import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const source = resolve(projectRoot, "worker/sites-worker.js");
const demoApiSource = resolve(projectRoot, "worker/demo-api.js");
const indexHtml = resolve(projectRoot, "dist/index.html");
const assetsDir = resolve(projectRoot, "dist/assets");
const target = resolve(projectRoot, "dist/server/index.js");
const demoApiTarget = resolve(projectRoot, "dist/server/demo-api.js");

const [workerSource, html] = await Promise.all([
  readFile(source, "utf8"),
  readFile(indexHtml, "utf8"),
]);

const assets = await readdir(assetsDir);
const jsAsset = assets.find((file) => file.endsWith(".js"));
const cssAsset = assets.find((file) => file.endsWith(".css"));

if (!jsAsset || !cssAsset) {
  throw new Error("Sites build requires one JavaScript asset and one CSS asset.");
}

const [appJs, appCss] = await Promise.all([
  readFile(resolve(assetsDir, jsAsset), "utf8"),
  readFile(resolve(assetsDir, cssAsset), "utf8"),
]);

let inlinedHtml = html;
for (const pattern of [
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
]) {
  let match = inlinedHtml.match(pattern);
  while (match) {
    const [tag, href] = match;
    const assetPath = resolve(projectRoot, "dist", href.replace(/^\//, ""));
    const content = await readFile(assetPath, "utf8");
    const replacement = tag.startsWith("<link")
      ? `<style>${content}</style>`
      : `<script type="module">${content.replaceAll("</script", "<\\/script")}</script>`;
    inlinedHtml = inlinedHtml.replace(tag, () => replacement);
    match = inlinedHtml.match(pattern);
  }
}

await mkdir(dirname(target), { recursive: true });
const workerWithHtml = workerSource
  .replace(
    "\"__SITES_INDEX_HTML__\"",
    () => JSON.stringify(inlinedHtml),
  )
  .replace(
    "\"__SITES_APP_JS__\"",
    () => JSON.stringify(appJs.replaceAll("</script", "<\\/script")),
  )
  .replace(
    "\"__SITES_APP_CSS__\"",
    () => JSON.stringify(appCss),
  );

await writeFile(target, workerWithHtml);
await copyFile(demoApiSource, demoApiTarget);
