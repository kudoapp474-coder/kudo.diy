import { cp, mkdir, readFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
for (const file of ["index.html", "styles.css", "script.js"]) await cp(file, "dist/" + file);
const html = await readFile("index.html", "utf8");
if (!/<title>[^<]+<\/title>/i.test(html)) throw new Error("index.html needs a title");
console.log("Static production build passed");