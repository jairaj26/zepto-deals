const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const jsPath = path.join(rootDir, 'zepto-deals-bookmarklet.js');
const txtPath = path.join(rootDir, 'bookmarklet.txt');
const htmlPath = path.join(rootDir, 'index.html');

console.log('Reading:', jsPath);
const jsContent = fs.readFileSync(jsPath, 'utf8');

// Encode for bookmarklet href
const bookmarkletCode = 'javascript:' + encodeURIComponent(jsContent);

fs.writeFileSync(txtPath, bookmarkletCode, 'utf8');
console.log('Updated bookmarklet.txt. Bytes:', bookmarkletCode.length);

let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Replace bookmarklet button href
htmlContent = htmlContent.replace(
  /<a class="bookmarklet-btn" href="javascript:[^"]*">/g,
  `<a class="bookmarklet-btn" href="${bookmarkletCode}">`
);

// Replace code variable in <script>
htmlContent = htmlContent.replace(
  /const code = "javascript:[^"]*";/g,
  `const code = "${bookmarkletCode}";`
);

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Updated index.html.');
