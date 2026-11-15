const fs = require('fs');
const path = require('path');

// Auto-detect root directory whether run from repo root or scripts directory
const rootDir = fs.existsSync(path.join(__dirname, 'zepto-deals-bookmarklet.js'))
  ? __dirname
  : path.resolve(__dirname, '..');

const jsPath = path.join(rootDir, 'zepto-deals-bookmarklet.js');
const txtPath = path.join(rootDir, 'bookmarklet.txt');
const htmlPath = path.join(rootDir, 'index.html');
const userJsPath = path.join(rootDir, 'zepto_deals.user.js');

console.log('Reading:', jsPath);
const jsContent = fs.readFileSync(jsPath, 'utf8');

// 1. Generate bookmarklet.txt
const bookmarkletCode = 'javascript:' + encodeURIComponent(jsContent);
fs.writeFileSync(txtPath, bookmarkletCode, 'utf8');
console.log('Updated bookmarklet.txt. Bytes:', bookmarkletCode.length);

// 2. Update index.html using replacer functions to avoid $ pattern interpretation
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

htmlContent = htmlContent.replace(
  /(<a class="bookmarklet-btn"[^>]*href=")javascript:[^"]*(")/g,
  (match, p1, p2) => p1 + bookmarkletCode + p2
);

htmlContent = htmlContent.replace(
  /const code = "javascript:[^"]*";/g,
  () => 'const code = "' + bookmarkletCode + '";'
);

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Updated index.html.');

// 3. Generate self-contained zepto_deals.user.js (eliminates external @require caching trap)
const userScriptHeader = `// ==UserScript==
// @name         Zepto Deals Tracker & Product Sorter
// @namespace    https://github.com/jairaj26/zepto-deals
// @version      1.0.0
// @description  Find 70%+ deals, browse subcategories, sort by discount, and view products in a clean 5-column grid on Zepto.
// @author       jairaj26
// @match        *://*.zepto.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js
// @downloadURL  https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js
// ==/UserScript==

`;

fs.writeFileSync(userJsPath, userScriptHeader + jsContent, 'utf8');
console.log('Updated zepto_deals.user.js (self-contained Userscript).');
