'use strict';
/**
 * Copies mithril's minified bundle from node_modules into renderer/vendor/
 * so the HTML page can load it without a build step or CDN dependency.
 */

const fs   = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'node_modules', 'mithril', 'mithril.min.js');
const dest = path.join(__dirname, '..', 'renderer', 'vendor', 'mithril.min.js');

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
