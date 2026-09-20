/**
 * Downloads the Indic faces the signage needs: npm run fonts
 *
 * Boards are painted on a 2D canvas and `fillText` does not wait. If a face has
 * not arrived the canvas is drawn in a fallback with no glyphs for the script
 * at all, every letter comes out a box, and the texture is already uploaded so
 * it never repairs itself. A district whose font is missing is a district whose
 * every shop sign is broken.
 *
 * THE RANGE MATCH IS EXACT, AND THAT IS NOT FUSSINESS
 *
 * A Google Fonts css2 response contains many `@font-face` blocks per family —
 * latin, latin-ext, and the Indic block. Picking the wrong one is silent: it
 * downloads, it parses, it renders boxes. This happened once already, when a
 * loose substring test matched `U+20C0` inside Telugu's latin-ext range and
 * overwrote a 124 KB Telugu file with a 17 KB latin one. So the block is chosen
 * by its FIRST unicode-range token matching the script's primary range exactly.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Face = {
  family: string;
  file: string;
  /** The subset name Google comments each block with: `/* telugu *\/`. */
  subset: string;
  /** Must appear in that block's unicode-range. The second lock on the door. */
  primaryRange: string;
};

const FACES: Face[] = [
  { family: "Noto Sans Telugu", file: "NotoSansTelugu.woff2", subset: "telugu", primaryRange: "u+0c00-0c7f" },
  { family: "Noto Sans Devanagari", file: "NotoSansDevanagari.woff2", subset: "devanagari", primaryRange: "u+0900-097f" },
  { family: "Noto Sans Tamil", file: "NotoSansTamil.woff2", subset: "tamil", primaryRange: "u+0b82-0bfa" },
  { family: "Noto Sans Bengali", file: "NotoSansBengali.woff2", subset: "bengali", primaryRange: "u+0980-09fe" },
  { family: "Noto Sans Kannada", file: "NotoSansKannada.woff2", subset: "kannada", primaryRange: "u+0c80-0cf3" },
  { family: "Noto Sans Malayalam", file: "NotoSansMalayalam.woff2", subset: "malayalam", primaryRange: "u+0d00-0d7f" },
  { family: "Noto Sans Gujarati", file: "NotoSansGujarati.woff2", subset: "gujarati", primaryRange: "u+0a80-0aff" },
  { family: "Noto Sans Gurmukhi", file: "NotoSansGurmukhi.woff2", subset: "gurmukhi", primaryRange: "u+0a01-0a76" },
  { family: "Noto Sans Oriya", file: "NotoSansOriya.woff2", subset: "oriya", primaryRange: "u+0b01-0b77" },
];

const OUT = join(process.cwd(), "public", "fonts");

/** A modern UA, or css2 serves TrueType instead of woff2. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchFace(face: Face) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(face.family)}:wght@400;700&display=swap`;
  const css = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());

  // Google labels every block with the subset it serves, in a comment right
  // above it. That label is the selector: matching on the unicode-range is
  // brittle because the ranges are reordered from time to time, and today the
  // Indic range is the THIRD token of a list that opens with Devanagari marks.
  const wanted = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)].find(
    ([, subset, body]) =>
      subset === face.subset &&
      (/unicode-range:\s*([^;]+);/.exec(body)?.[1] ?? "").toLowerCase().includes(face.primaryRange)
  )?.[2];
  if (!wanted) throw new Error(`no "${face.subset}" block carrying ${face.primaryRange}`);

  const src = /src:\s*url\(([^)]+)\)/.exec(wanted)?.[1];
  if (!src) throw new Error("no src url");

  const buf = await fetch(src).then((r) => r.arrayBuffer());
  const bytes = Buffer.from(buf as ArrayBuffer);
  // A woff2 begins "wOF2". Anything else is an HTML error page wearing the
  // right extension, and it will fail silently at render time.
  if (bytes.subarray(0, 4).toString("latin1") !== "wOF2") throw new Error("not a woff2");

  await writeFile(join(OUT, face.file), bytes);
  return { family: face.family, file: face.file, bytes: bytes.length, primaryRange: face.primaryRange.toUpperCase(), licence: "OFL-1.1", source: "fonts.googleapis.com css2" };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = [];
  for (const face of FACES) {
    try {
      const entry = await fetchFace(face);
      console.log(`  ok    ${entry.file.padEnd(28)} ${(entry.bytes / 1024).toFixed(0)} KB`);
      manifest.push(entry);
    } catch (err) {
      console.log(`  FAIL  ${face.file.padEnd(28)} ${(err as Error).message}`);
    }
  }
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${manifest.length}/${FACES.length} faces in public/fonts\n`);
}
main();
