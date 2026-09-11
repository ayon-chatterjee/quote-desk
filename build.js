/* Inlines the source files into one publishable HTML page. */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const order = ['seed.js', 'rules.js', 'prompts.js', 'fallback.js', 'generator.js', 'sample.js', 'guardrails.js', 'pipeline.js', 'app-core.js', 'app-views.js', 'boot.js'];
let html = fs.readFileSync(path.join(dir, 'src/index.html'), 'utf8');
const scripts = order.map(f => {
  const src = fs.readFileSync(path.join(dir, 'src', f), 'utf8');
  if (src.includes('</script')) throw new Error(f + ' contains a closing script tag');
  return '<script>\n/* ' + f + ' */\n' + src + '\n</script>';
}).join('\n');
const out = html + '\n' + scripts + '\n';
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist/quote-desk.html'), out);
// shareable copy: same page, published without db so it can be shared outside the organisation
fs.writeFileSync(path.join(dir, 'dist/quote-desk-shareable.html'), out.replace('<title>Quote Desk</title>', '<title>Quote Desk Public</title>'));
// local preview copy: the artifact wrapper supplies the charset when published, the file server does not
fs.writeFileSync(path.join(dir, 'dist/local.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n' + out + '\n</body></html>');
console.log('dist/quote-desk.html  ' + (out.length / 1024).toFixed(1) + ' KB');
