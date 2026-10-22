#!/usr/bin/env node
/* Stamp the service worker's cache name with a hash of the app shell.

   Why this exists
   The service worker only tells an open tab that a new build exists when
   sw.js itself changes. index.html changed across three merged PRs without
   sw.js changing once, so no installed worker ever updated and nobody
   running the app was told. Navigations are network-first, so a manual
   reload was always fresh, but an app left playing all night, which is the
   entire point of this one, kept showing the old interface.

   Deriving the cache name from the shell's hash makes that impossible to
   forget. Change index.html, run this, and every installed worker sees a
   new sw.js, installs, purges the old cache and raises the update prompt.

   .dev/verify.js fails when the stamp is stale, so CI catches a forgotten
   run rather than a user noticing weeks later.

   Run: node .dev/stamp.js */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const CR = String.fromCharCode(13);

/* Strip carriage returns before hashing. Git checks this file out as LF on
   Linux and CRLF on Windows, so hashing the raw bytes produced a different
   stamp in CI than on the machine that wrote it, and the build failed on a
   difference that does not exist in the app.

   Written with String.fromCharCode rather than an escape sequence on
   purpose: this value has been corrupted twice by tooling that rewrites
   backslashes, and a silently wrong hash here fails CI on every commit. */
function shellTag(){
  const text = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split(CR).join("");
  return "murmur-" + crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
}

const swPath = path.join(ROOT, "sw.js");
let sw = fs.readFileSync(swPath, "utf8");
const found = sw.match(/var CACHE = "([^"]+)"/);
if (!found){
  console.error("could not find the CACHE declaration in sw.js");
  process.exit(1);
}

const tag = shellTag();
if (found[1] === tag){
  console.log("already stamped: " + tag);
  process.exit(0);
}
sw = sw.replace(/var CACHE = "[^"]+"/, 'var CACHE = "' + tag + '"');
fs.writeFileSync(swPath, sw);
console.log(found[1] + "  ->  " + tag);
