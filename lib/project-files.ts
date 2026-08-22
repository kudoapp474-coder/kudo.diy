export type ProjectFileRecord = {
  path: string;
  content: string;
  language?: string;
};

const PREVIEW_CSS_PATHS = ["styles.css", "style.css", "src/style.css", "src/styles.css"];
const PREVIEW_SCRIPT_PATHS = ["script.js", "main.js", "src/main.js"];

export function safeProjectPath(path: string) {
  const normalized = path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.length > 240 || normalized.startsWith("/") || normalized.includes("\0")) return null;
  if (normalized.split("/").some(part => !part || part === ".." || part === ".")) return null;
  return normalized;
}

function insertBeforeClosingTag(document: string, tag: "head" | "body", value: string) {
  const closingTag = new RegExp(`</${tag}>`, "i");
  if (closingTag.test(document)) return document.replace(closingTag, `${value}</${tag}>`);
  return tag === "head" ? value + document : document + value;
}

function removeLocalAssetTags(document: string) {
  return document
    .replace(/<link\b[^>]*href=["'](?:\.\/)?(?:styles?|src\/styles?)\.css["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*src=["'](?:\.\/)?(?:script|main|src\/main)\.js["'][^>]*>\s*<\/script>/gi, "");
}

export function renderProjectDocument(files: ProjectFileRecord[], title = "KODO project") {
  const byPath = new Map(files.map(file => [file.path.replace(/^\.\//, ""), file.content]));
  let html = byPath.get("index.html")?.trim();
  if (!html) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0f;color:#f5f4ee;font:16px system-ui}main{text-align:center;max-width:560px;padding:32px}p{color:#9b9aa4}</style></head><body><main><h1>Start building with KODO</h1><p>Describe the website in the agent panel. Your generated preview will appear here.</p></main></body></html>`;
  }

  const css = PREVIEW_CSS_PATHS.map(path => byPath.get(path)).find(Boolean) ?? "";
  const script = PREVIEW_SCRIPT_PATHS.map(path => byPath.get(path)).find(Boolean) ?? "";
  html = removeLocalAssetTags(html);
  html = insertBeforeClosingTag(html, "head", `<base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1">${css ? `<style>${css}</style>` : ""}`);
  if (script) html = insertBeforeClosingTag(html, "body", `<script>${script.replaceAll("</script>", "<\\/script>")}</script>`);
  return html;
}

export function starterProjectFiles(name: string): ProjectFileRecord[] {
  const safeName = escapeHtml(name.slice(0, 100) || "My project");
  return [
    {
      path: "index.html",
      language: "html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeName}</title>
    <meta name="description" content="Built with KODO" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="starter-shell">
      <span class="eyebrow">KODO PROJECT</span>
      <h1>${safeName}</h1>
      <p>Your project is ready. Ask KODO to design and build the complete website.</p>
      <button type="button" id="starter-action">Start exploring</button>
    </main>
    <script src="./script.js"></script>
  </body>
</html>`,
    },
    {
      path: "styles.css",
      language: "css",
      content: `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#09090b;color:#f7f7f2}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 75% 10%,rgba(109,94,252,.2),transparent 30%),#09090b}.starter-shell{min-height:100vh;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;max-width:980px;margin:auto;padding:8vw}.eyebrow{font-size:.72rem;letter-spacing:.16em;color:#8f87ff}h1{max-width:800px;margin:.6rem 0;font-size:clamp(3rem,9vw,7.5rem);line-height:.9;letter-spacing:-.07em}p{max-width:560px;color:#aaa8b1;font-size:clamp(1rem,2vw,1.25rem);line-height:1.6}button{margin-top:1rem;border:0;border-radius:999px;padding:.9rem 1.3rem;background:#f7f7f2;color:#09090b;font-weight:750;cursor:pointer}`,
    },
    {
      path: "script.js",
      language: "javascript",
      content: `document.querySelector("#starter-action")?.addEventListener("click",()=>{document.querySelector(".starter-shell p").textContent="Everything here can be changed through the KODO agent."});`,
    },
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({ name: slugify(name) || "kodo-project", private: true, version: "1.0.0", scripts: { build: "node scripts/build.mjs", test: "npm run build" } }, null, 2),
    },
    {
      path: "scripts/build.mjs",
      language: "javascript",
      content: `import { cp, mkdir, readFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
for (const file of ["index.html", "styles.css", "script.js"]) await cp(file, "dist/" + file);
const html = await readFile("index.html", "utf8");
if (!/<title>[^<]+<\\/title>/i.test(html)) throw new Error("index.html needs a title");
console.log("Static production build passed");`,
    },
  ];
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
