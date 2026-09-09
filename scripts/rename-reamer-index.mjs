// Vite always names an HTML entry's output after its source filename, so
// the build emits dist-reamer/reamer.html. A static host serves "/" from
// index.html, so this renames it after the build — that's it.
import { rename } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const from = fileURLToPath(new URL("../dist-reamer/reamer.html", import.meta.url));
const to = fileURLToPath(new URL("../dist-reamer/index.html", import.meta.url));

await rename(from, to);
console.log("dist-reamer/reamer.html -> dist-reamer/index.html");
