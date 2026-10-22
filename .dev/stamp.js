#!/usr/bin/env node
/* Stamp the service worker's cache name with a hash of the app shell.

   Why this exists
   The service worker only tells an open tab that a new build exists when
   sw.js itself changes. index.html changed three times without sw.js
   changing, so nobody running the app was ever notified: navigations are
   network-first, which means a manual reload is always fresh, but someone
   who leaves the app playing all night (which is the whole point of it)
   kept seeing the old interface.

   Deriving the cache name from the shell's hash makes that impossible.
   Change index.html, run this, and every installed worker sees a new
   sw.js, installs, purges the old cache and raises the update prompt.

   .dev/verify.js fails if the stamp is out of date, so CI catches a
   forgotten run rather than a user noticing weeks later.

   Run: node .dev/stamp.js */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

/* Hash the bytes, not a normalised string: the file is CRLF on disk and
   both this and the check in verify.js read it the same way. */
function shellTag(){
  const bytes = fs.readFileSync(path.join(ROOT, "index.html"));
  return "murmur-" + crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 8);
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

module.exports = { shellTag };
