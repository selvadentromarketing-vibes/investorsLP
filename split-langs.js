/**
 * Splits bilingual HTML pages into:
 *  - English at root (lang="en")
 *  - Spanish under /es/ subfolder (lang="es")
 *
 * Each version:
 *  - Removes the <div class="lang-toggle"> widgets
 *  - Removes the setLang() function + localStorage bootstrap
 *  - Gets a discreet text link pointing to the other language
 *  - Spanish version also rewrites relative asset paths with `../`
 *  - Both versions get <link rel="alternate" hreflang="..."> pairs in <head>
 *
 * Content bilingual spans (.en/.es) are kept as-is — CSS hides the inactive
 * language based on <html lang>. This avoids brittle span stripping while
 * still giving each URL a single visible language.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ES_DIR = path.join(ROOT, 'es');
const PAGES = [
  'index.html',
  'book-call.html',
  'guide.html',
  'webinar.html',
  'thank-you-call.html',
  'thank-you-guide.html',
  'thank-you-webinar.html',
];

// Asset filenames that, when appearing unprefixed, should get `../` in /es/ pages.
const RELATIVE_ASSETS = [
  'tailwind.css',
  'selvadentro-logo-sm.webp',
  'selvadentro-logo-sm.png',
  'hero-bg-opt.jpg',
  'hero-bg-mobile.jpg',
  'hero-bg.jpg',
  'Aldea-Zama-Masterplan-fondo-blanco.jpg',
  'EB-MD8411.webp',
  'selvadentro-masterplan.jpg',
  'selvadentro-masterplan.webp',
  'og-image.jpg',
];

if (!fs.existsSync(ES_DIR)) fs.mkdirSync(ES_DIR, { recursive: true });

const DISCREET_LINK_STYLE =
  'color:#9A8E7A;font-size:0.72rem;font-weight:600;letter-spacing:0.05em;text-decoration:none;text-transform:uppercase;transition:color 0.2s;';

function buildEnglishLinks(filename) {
  const href = `es/${filename}`;
  return {
    desktop: `      <a href="${href}" hreflang="es" class="desktop-only" style="${DISCREET_LINK_STYLE}" onmouseover="this.style.color='#465241'" onmouseout="this.style.color='#9A8E7A'">Español</a>`,
    simple: `    <a href="${href}" hreflang="es" style="${DISCREET_LINK_STYLE}" onmouseover="this.style.color='#465241'" onmouseout="this.style.color='#9A8E7A'">Español</a>`,
    mobile: `        <div class="flex justify-center pt-1 pb-1"><a href="${href}" hreflang="es" style="${DISCREET_LINK_STYLE}">Español</a></div>`,
  };
}

function buildSpanishLinks(filename) {
  const href = `../${filename}`;
  return {
    desktop: `      <a href="${href}" hreflang="en" class="desktop-only" style="${DISCREET_LINK_STYLE}" onmouseover="this.style.color='#465241'" onmouseout="this.style.color='#9A8E7A'">English</a>`,
    simple: `    <a href="${href}" hreflang="en" style="${DISCREET_LINK_STYLE}" onmouseover="this.style.color='#465241'" onmouseout="this.style.color='#9A8E7A'">English</a>`,
    mobile: `        <div class="flex justify-center pt-1 pb-1"><a href="${href}" hreflang="en" style="${DISCREET_LINK_STYLE}">English</a></div>`,
  };
}

const RE_DESKTOP_TOGGLE =
  /[ \t]*<div class="lang-toggle desktop-only">\s*<button[\s\S]*?<\/button>\s*<button[\s\S]*?<\/button>\s*<\/div>/;
const RE_MOBILE_CONTAINER =
  /[ \t]*<div class="flex justify-center">\s*<div class="lang-toggle">\s*<button[\s\S]*?<\/button>\s*<button[\s\S]*?<\/button>\s*<\/div>\s*<\/div>/;
const RE_STANDALONE_TOGGLE =
  /[ \t]*<div class="lang-toggle">\s*<button[\s\S]*?<\/button>\s*<button[\s\S]*?<\/button>\s*<\/div>/;
const RE_SETLANG =
  /function setLang\(lang\) \{[\s\S]*?\}\s*\(function\(\) \{\s*var saved = localStorage\.getItem\("slvd_lang"\);\s*if \(saved === "es"\) \{ setLang\("es"\); \}\s*\}\)\(\);\s*/;

function removeLangMachinery(html, links) {
  // Order matters: desktop-only toggle first (index.html), then the mobile
  // container (index.html), then any remaining standalone toggle (other pages).
  html = html.replace(RE_DESKTOP_TOGGLE, links.desktop);
  html = html.replace(RE_MOBILE_CONTAINER, links.mobile);
  html = html.replace(RE_STANDALONE_TOGGLE, links.simple);
  html = html.replace(RE_SETLANG, '');
  return html;
}

function addHreflangAlternates(html, filename, variant) {
  const selfEn = `https://investor.selvadentrotulum.com/${filename === 'index.html' ? '' : filename}`;
  const selfEs = `https://investor.selvadentrotulum.com/es/${filename === 'index.html' ? '' : filename}`;
  const alternates = [
    `  <link rel="alternate" hreflang="en" href="${selfEn}"/>`,
    `  <link rel="alternate" hreflang="es" href="${selfEs}"/>`,
    `  <link rel="alternate" hreflang="x-default" href="${selfEn}"/>`,
  ].join('\n');
  // Insert right after the <title> tag.
  return html.replace(/(<title>[^<]*<\/title>)/, `$1\n${alternates}`);
}

function rewriteAssetPathsForEs(html) {
  // Prefix known relative asset filenames with `../` inside common attributes.
  for (const asset of RELATIVE_ASSETS) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(
      new RegExp(`(src|href|content)="${escaped}"`, 'g'),
      `$1="../${asset}"`
    );
  }
  // Rewrite srcset / imagesrcset values by parsing each comma-separated entry.
  html = html.replace(/(srcset|imagesrcset)="([^"]+)"/g, (_m, attr, val) => {
    const rewritten = val.split(',').map((entry) => {
      const leading = entry.match(/^\s*/)[0];
      const body = entry.slice(leading.length);
      const [url, ...rest] = body.split(/\s+/);
      if (
        url.startsWith('/') ||
        url.startsWith('http') ||
        url.startsWith('../') ||
        url.startsWith('data:')
      ) {
        return entry;
      }
      return leading + [`../${url}`, ...rest].join(' ');
    }).join(',');
    return `${attr}="${rewritten}"`;
  });
  return html;
}

function transformEnglish(html, filename) {
  html = removeLangMachinery(html, buildEnglishLinks(filename));
  html = addHreflangAlternates(html, filename, 'en');
  return html;
}

function transformSpanish(html, filename) {
  html = html.replace(/<html lang="en">/, '<html lang="es">');
  html = removeLangMachinery(html, buildSpanishLinks(filename));
  html = rewriteAssetPathsForEs(html);
  html = addHreflangAlternates(html, filename, 'es');
  return html;
}

for (const page of PAGES) {
  const srcPath = path.join(ROOT, page);
  const original = fs.readFileSync(srcPath, 'utf8');

  const en = transformEnglish(original, page);
  const es = transformSpanish(original, page);

  fs.writeFileSync(srcPath, en);
  fs.writeFileSync(path.join(ES_DIR, page), es);

  const beforeLen = original.length;
  const enLen = en.length;
  const esLen = es.length;
  console.log(
    `${page.padEnd(26)} en: ${String(enLen).padStart(6)} bytes (Δ${enLen - beforeLen})   es: ${String(esLen).padStart(6)} bytes`
  );
}

console.log('\nDone.');
