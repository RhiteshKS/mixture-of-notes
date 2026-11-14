#!/usr/bin/env node
'use strict';

/*
  Mixture of Notes: a tiny static site generator. No dependencies.

    node build.js           build the site into dist/
    node build.js serve     build, then serve dist/ at http://localhost:8080
                            (HTML pages are rebuilt on every request, so edit and refresh)

  Inputs:   site.config.json, content/posts/*.md, assets/
  Output:   dist/  (upload this folder to any static host)
*/

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

let cfg, BASE, SITE, SERIES, POSTS, published, seriesBy, bySlug;

/* Reading time: prose is read at WORDS_PER_MINUTE, and every non-empty
   line of code adds SECONDS_PER_CODE_LINE (code is read more slowly). */
const WORDS_PER_MINUTE = 200;
const SECONDS_PER_CODE_LINE = 3;

/* ------------------------------------------------------------------
   small helpers
------------------------------------------------------------------ */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmt = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const href = p => BASE + p;
const abs = p => SITE + BASE + p;
const colorOf = c => (c && c.indexOf('--') === 0 ? 'var(' + c + ')' : c || 'var(--accent)');
const postUrl = p => '/posts/' + p.slug + '/';
const seriesUrl = s => '/series/' + s.slug + '/';

/* ------------------------------------------------------------------
   Markdown renderer (small, covers what the posts need)
   headings ##/###, paragraphs, lists, tables, fenced code with
   ```python title=file.py, blockquotes, **bold**, *italic*, `code`,
   [links](https://...), callouts (:::note Title ... ::: or :::tip)
------------------------------------------------------------------ */
function inline(s) {
  const stash = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    stash.push('<code>' + esc(c) + '</code>');
    return '\u0000' + (stash.length - 1) + '\u0000';
  });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
       .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

const RE_PY = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[fr]?"(?:\\.|[^"\\\n])*"|[fr]?'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?(?:e-?\d+)?\b)|\b(def|class|return|import|from|as|if|elif|else|for|while|in|not|and|or|is|None|True|False|with|try|except|finally|raise|lambda|yield|pass|break|continue|assert|global|nonlocal|async|await)\b|\b([A-Za-z_]\w*)(?=\()/g;
const RE_SH = /(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'[^'\n]*')|(\s--?[A-Za-z][\w-]*)/g;

function hl(code, re, pick) {
  let out = '', last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    out += '<span class="tk-' + pick(m) + '">' + esc(m[0]) + '</span>';
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}
function highlight(code, lang) {
  if (/^(py|python)$/.test(lang)) return hl(code, RE_PY, m => (m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] ? 'k' : 'f'));
  if (/^(sh|bash|shell)$/.test(lang)) return hl(code, RE_SH, m => (m[1] ? 'c' : m[2] ? 's' : 'k'));
  return esc(code);
}
function codeBlock(code, lang, title) {
  return '<figure class="code"><figcaption><span>' + esc(title || lang || 'text') + '</span>' +
    '<button class="copy" type="button" aria-label="Copy code">Copy</button></figcaption>' +
    '<pre><code>' + highlight(code, lang) + '</code></pre></figure>';
}

function md(src, ids) {
  ids = ids || new Set();
  const lines = src.replace(/\r/g, '').trim().split('\n');
  const out = [], heads = [];
  let i = 0, m;
  const blank = l => /^\s*$/.test(l);
  const isList = l => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l);
  const starter = l => /^(```|#{2,3}\s|:::|>|---+\s*$|\|)/.test(l) || isList(l);

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }

    if ((m = line.match(/^```(.*)$/))) {
      const info = m[1].trim();
      let lang = info.split(/\s+/)[0] || '';
      if (/^title=/.test(lang)) lang = '';
      const tm = info.match(/title=(\S+)/);
      i++;
      const buf = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(codeBlock(buf.join('\n'), lang, tm ? tm[1] : ''));
      continue;
    }

    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      const lvl = m[1].length, text = m[2].trim();
      const base = slugify(text) || 'section';
      let id = base, n = 2;
      while (ids.has(id)) id = base + '-' + n++;
      ids.add(id);
      heads.push({ lvl, text, id });
      out.push('<h' + lvl + ' id="' + id + '">' + inline(text) + '</h' + lvl + '>');
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if ((m = line.match(/^:::(\w+)\s*(.*)$/))) {
      const kind = m[1], title = m[2];
      i++;
      const cb = [];
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { cb.push(lines[i]); i++; }
      i++;
      out.push('<aside class="callout ' + esc(kind) + '"><div class="callout-kind">' + esc(kind) + '</div>' +
        (title ? '<div class="callout-title">' + inline(title) + '</div>' : '') +
        md(cb.join('\n'), ids).html + '</aside>');
      continue;
    }

    if (/^>/.test(line)) {
      const qb = [];
      while (i < lines.length && /^>/.test(lines[i])) { qb.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + md(qb.join('\n'), ids).html + '</blockquote>');
      continue;
    }

    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line), rows = [];
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="table-wrap"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') +
        '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    if (isList(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].match(re)[1]); i++; }
      const tag = ordered ? 'ol' : 'ul';
      out.push('<' + tag + '>' + items.map(t => '<li>' + inline(t) + '</li>').join('') + '</' + tag + '>');
      continue;
    }

    const pb = [line];
    i++;
    while (i < lines.length && !blank(lines[i]) && !starter(lines[i])) { pb.push(lines[i]); i++; }
    out.push('<p>' + inline(pb.join(' ')) + '</p>');
  }
  return { html: out.join('\n'), heads };
}

/* ------------------------------------------------------------------
   content loading
------------------------------------------------------------------ */
function parsePost(file) {
  const slug = path.basename(file, '.md');
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(slug + '.md: missing frontmatter block');
  const meta = {};
  m[1].split('\n').forEach(line => {
    const k = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!k) return;
    let v = k[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
    else v = v.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    meta[k[1]] = v;
  });
  const body = m[2].trim();
  const p = {
    slug,
    title: meta.title || slug,
    dek: meta.dek || '',
    date: meta.date || '',
    series: meta.series || '',
    part: meta.part ? Number(meta.part) : 0,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    status: meta.status || 'published',
    body
  };
  p.published = p.status === 'published';
  if (p.published) {
    if (!body) throw new Error(slug + '.md: status is published but the body is empty');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error(slug + '.md: a published post needs date: YYYY-MM-DD');
    const r = md(body);
    p.html = r.html;
    p.heads = r.heads;
    const codeBlocks = r.html.match(/<figure class="code">[\s\S]*?<\/figure>/g) || [];
    const prose = r.html
      .replace(/<figure class="code">[\s\S]*?<\/figure>/g, ' ')
      .replace(/<\/(p|li|h[23]|td|th|div|aside|blockquote|tr)>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;|&#\d+;/g, ' ');
    p.words = prose.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
    p.codeLines = codeBlocks.reduce((n, f) => {
      const m = f.match(/<code>([\s\S]*?)<\/code>/);
      return n + (m ? m[1].replace(/<[^>]+>/g, '').split('\n').filter(l => l.trim()).length : 0);
    }, 0);
    p.minutes = Math.max(1, Math.round(p.words / WORDS_PER_MINUTE + p.codeLines * SECONDS_PER_CODE_LINE / 60));
  }
  return p;
}

function load() {
  cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  BASE = (cfg.basePath || '').replace(/\/$/, '');
  SITE = (cfg.url || '').replace(/\/$/, '');
  SERIES = cfg.series.map(s => Object.assign({}, s, { cssColor: colorOf(s.color) }));
  seriesBy = {};
  SERIES.forEach(s => { seriesBy[s.slug] = s; });

  const dir = path.join(ROOT, 'content', 'posts');
  POSTS = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => parsePost(path.join(dir, f)));
  bySlug = {};
  POSTS.forEach(p => {
    bySlug[p.slug] = p;
    if (p.series && !seriesBy[p.series]) throw new Error(p.slug + '.md: unknown series "' + p.series + '" (add it to site.config.json)');
  });
  published = POSTS.filter(p => p.published).sort((a, b) => b.date.localeCompare(a.date));
  /* hide a series until it has at least one post */
  SERIES = SERIES.filter(s => POSTS.some(p => p.series === s.slug));
}
const partsOf = slug => POSTS.filter(p => p.series === slug).sort((a, b) => a.part - b.part);

/* ------------------------------------------------------------------
   shared fragments
------------------------------------------------------------------ */
function segs(ps) {
  const done = ps.filter(p => p.published).length;
  return '<div class="segs" role="img" aria-label="' + done + ' of ' + ps.length + ' parts published">' +
    ps.map(p => '<span class="seg' + (p.published ? ' on' : '') + '"></span>').join('') + '</div>';
}
const chipText = s => '<span class="chip" style="--c:' + s.cssColor + '"><i class="dot"></i>' + esc(s.title) + '</span>';

function partRow(p, big) {
  const inner = '<span class="part-n">' + String(p.part).padStart(2, '0') + '</span>' +
    '<span class="part-body"><span class="part-t">' + esc(p.title) + '</span>' +
    (big ? '<span class="part-d">' + esc(p.dek) + '</span>' : '') + '</span>' +
    '<span class="pill">' + (p.published ? p.minutes + ' min' : 'Planned') + '</span>';
  return p.published
    ? '<li><a class="part" href="' + href(postUrl(p)) + '">' + inner + '</a></li>'
    : '<li><span class="part is-planned">' + inner + '</span></li>';
}

const PANEL_ROWS = 6; /* rows shown per series on the home page */
function seriesPanel(s) {
  const ps = partsOf(s.slug), done = ps.filter(p => p.published).length;
  return '<article class="feature" style="--c:' + s.cssColor + '">' +
    '<div class="feature-main">' +
      '<span class="eyebrow">Series &middot; ' + done + ' of ' + ps.length + ' parts published</span>' +
      '<h3><a href="' + href(seriesUrl(s)) + '">' + esc(s.title) + '</a></h3>' +
      '<p>' + esc(s.blurb) + '</p>' + segs(ps) +
      '<a class="btn btn-c" href="' + href(seriesUrl(s)) + '">Open the series</a>' +
    '</div>' +
    '<ol class="parts">' + ps.slice(0, PANEL_ROWS).map(p => partRow(p, false)).join('') +
      (ps.length > PANEL_ROWS ? '<li class="parts-more"><a href="' + href(seriesUrl(s)) + '">+ ' + (ps.length - PANEL_ROWS) + ' more parts</a></li>' : '') + '</ol>' +
  '</article>';
}

function rowHtml(p, data) {
  const s = p.series ? seriesBy[p.series] : null;
  const attrs = data
    ? ' data-series="' + (s ? s.slug : 'none') + '" data-hay="' + esc([p.title, p.dek, p.tags.join(' '), s ? s.title : ''].join(' ').toLowerCase()) + '"'
    : '';
  return '<a class="row" href="' + href(postUrl(p)) + '"' + attrs + '>' +
    '<span class="meta">' + fmt(p.date) + '</span>' +
    '<span><span class="row-title">' + esc(p.title) + '</span><span class="row-dek">' + esc(p.dek) + '</span></span>' +
    '<span class="row-side">' + (s ? chipText(s) : '<span class="meta">Standalone</span>') +
    '<span class="meta">' + p.minutes + ' min</span></span></a>';
}

/* ------------------------------------------------------------------
   page shell: <head> with SEO and link-preview tags, header, footer
------------------------------------------------------------------ */
function shell(o) {
  const title = o.route === '/' ? cfg.name + ' · ' + cfg.tagline : o.title + ' · ' + cfg.name;
  const url = SITE ? abs(o.route) : '';
  const nav = (key, label, p) => '<a href="' + href(p) + '"' + (o.nav === key ? ' aria-current="page"' : '') + '>' + label + '</a>';
  const ld = o.jsonld ? '<script type="application/ld+json">' + JSON.stringify(o.jsonld).replace(/</g, '\\u003c') + '</script>\n' : '';
  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + esc(o.desc) + '">\n' +
    (o.noindex ? '<meta name="robots" content="noindex">\n' : '') +
    (url ? '<link rel="canonical" href="' + esc(url) + '">\n<meta property="og:url" content="' + esc(url) + '">\n' : '') +
    '<meta property="og:site_name" content="' + esc(cfg.name) + '">\n' +
    '<meta property="og:type" content="' + (o.type || 'website') + '">\n' +
    '<meta property="og:title" content="' + esc(o.route === '/' ? cfg.name : o.title) + '">\n' +
    '<meta property="og:description" content="' + esc(o.desc) + '">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    (o.date ? '<meta property="article:published_time" content="' + o.date + '">\n<meta property="article:author" content="' + esc(cfg.author) + '">\n' : '') +
    '<meta name="theme-color" content="#F5F7F4" media="(prefers-color-scheme: light)">\n' +
    '<meta name="theme-color" content="#0B1117" media="(prefers-color-scheme: dark)">\n' +
    '<link rel="icon" href="' + href('/assets/favicon.svg') + '" type="image/svg+xml">\n' +
    (SITE ? '<link rel="alternate" type="application/rss+xml" title="' + esc(cfg.name) + '" href="' + href('/feed.xml') + '">\n' : '') +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=swap" rel="stylesheet">\n' +
    '<script>try{var t=localStorage.getItem("mon-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>\n' +
    '<link rel="stylesheet" href="' + href('/assets/style.css') + '">\n' +
    ld +
    '</head>\n<body>\n' +
    '<a class="skip" href="#main">Skip to content</a>\n' +
    '<header class="site-header">\n' +
    '  <div class="wrap bar">\n' +
    '    <a class="brand" href="' + href('/') + '" aria-label="' + esc(cfg.name) + ' home">\n' +
    '      <svg viewBox="0 0 28 28" aria-hidden="true"><rect class="mark-bg" width="28" height="28" rx="8"/><path class="mark-fg" d="M6 8 C10 8 10 19 15 19 S20 18 22 18"/></svg>\n' +
    '      <span>' + esc(cfg.name) + '</span>\n' +
    '    </a>\n' +
    '    <nav aria-label="Primary">' + nav('writing', 'Writing', '/writing/') + nav('series', 'Series', '/series/') + nav('about', 'About', '/about/') + '</nav>\n' +
    '    <button class="icon-btn" id="theme" type="button" aria-label="Switch theme"></button>\n' +
    '  </div>\n' +
    '  <div class="progress" id="progress" aria-hidden="true"><i></i></div>\n' +
    '</header>\n' +
    '<main id="main">\n' + o.body + '\n</main>\n' +
    '<footer class="site-footer"><div class="wrap foot">' +
    '<span>&copy; ' + new Date().getFullYear() + ' ' + esc(cfg.author) + '</span>' +
    '<nav aria-label="Elsewhere">' +
    (SITE ? '<a href="' + href('/feed.xml') + '">RSS</a>' : '') +
    cfg.links.map(l => '<a href="' + esc(l.href) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>').join('') +
    '</nav></div></footer>\n' +
    '<script src="' + href('/assets/site.js') + '" defer></script>\n' +
    '</body>\n</html>\n';
}

/* ------------------------------------------------------------------
   pages
------------------------------------------------------------------ */
function pageHome() {
  const latest = published.slice(0, 5);
  const first = SERIES[0];
  const body =
    '<section class="wrap"><div class="hero">' +
      '<div>' +
        '<div class="run-line"><span>run 001</span><span>1&times; gpu</span><span>8 gb vram</span><span>seed 42</span></div>' +
        '<h1>' + cfg.headline + '</h1>' +
        '<p class="lede">' + esc(cfg.intro) + '</p>' +
        '<div class="hero-cta"><a class="btn btn-primary" href="' + href(seriesUrl(first)) + '">Start the fine-tuning series</a>' +
        '<a class="btn btn-ghost" href="' + href('/writing/') + '">All writing</a></div>' +
        '<div class="meta hero-meta">' + published.length + ' posts &middot; ' + SERIES.length + ' series &middot; last update ' + fmt(published[0].date) + '</div>' +
      '</div>' +
      '<div class="chart-card">' +
        '<div class="chart-head"><span>train / eval loss</span><span class="readout" id="readout">&nbsp;</span></div>' +
        '<div class="chart-box" id="chart"></div>' +
        '<div class="chart-foot"><span><i class="lg lg-train"></i>train</span><span><i class="lg lg-eval"></i>eval</span><span><i class="lg lg-warm"></i>warmup</span><span class="grow">illustrative curve</span></div>' +
      '</div>' +
    '</div></section>' +

    '<section class="wrap section"><div class="section-head"><h2>Now writing</h2><a class="more" href="' + href('/series/') + '">All series &rarr;</a></div>' +
      '<div class="stack">' + SERIES.slice(0, 2).map(seriesPanel).join('') + '</div></section>' +

    '<section class="wrap section"><div class="section-head"><h2>Latest writing</h2><a class="more" href="' + href('/writing/') + '">Browse all &rarr;</a></div>' +
      '<div class="rows">' + latest.map(p => rowHtml(p)).join('') + '</div></section>' +

    '<section class="wrap section"><div class="section-head"><h2>Series</h2></div><div class="cards">' +
      SERIES.map(s => {
        const ps = partsOf(s.slug), done = ps.filter(p => p.published).length;
        return '<a class="scard" style="--c:' + s.cssColor + '" href="' + href(seriesUrl(s)) + '">' +
          chipText(s) + '<h3>' + esc(s.title) + '</h3><p>' + esc(s.blurb) + '</p>' + segs(ps) +
          '<div class="foot"><span class="meta">' + done + ' of ' + ps.length + ' parts</span><span class="meta">Open &rarr;</span></div></a>';
      }).join('') + '</div></section>';

  return shell({
    route: '/', nav: 'home', desc: cfg.intro, body,
    jsonld: Object.assign({ '@context': 'https://schema.org', '@type': 'Blog', name: cfg.name, description: cfg.intro, author: { '@type': 'Person', name: cfg.author } }, SITE ? { url: abs('/') } : {})
  });
}

function pageWriting() {
  const filters = [{ k: 'all', t: 'All' }].concat(SERIES.map(s => ({ k: s.slug, t: s.title }))).concat([{ k: 'none', t: 'Standalone' }]);
  const years = {};
  published.forEach(p => { const y = p.date.slice(0, 4); (years[y] = years[y] || []).push(p); });
  const list = Object.keys(years).sort().reverse().map(y =>
    '<section class="year-group"><h2 class="year">' + y + '</h2><div class="rows">' + years[y].map(p => rowHtml(p, true)).join('') + '</div></section>').join('');
  const body = '<section class="wrap page">' +
    '<header class="page-head"><h1>Writing</h1><p class="lede">Every published post, newest first. Search by title, tag or topic.</p></header>' +
    '<noscript><style>.controls{display:none}</style></noscript>' +
    '<div class="controls">' +
      '<label class="search"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg>' +
      '<input id="search" type="search" placeholder="Search posts" autocomplete="off" aria-label="Search posts"></label>' +
      '<div class="filters">' + filters.map(f => '<button class="filter" type="button" data-f="' + esc(f.k) + '" aria-pressed="' + (f.k === 'all') + '">' + esc(f.t) + '</button>').join('') + '</div>' +
    '</div>' +
    '<div id="list">' + list + '<p class="empty" id="empty" hidden>No posts match that search. Try fewer words, or clear the filter.</p></div></section>';
  return shell({ route: '/writing/', nav: 'writing', title: 'Writing', desc: 'Every published post on ' + cfg.name + ', newest first.', body });
}

function pageSeriesIndex() {
  const body = '<section class="wrap page"><header class="page-head"><h1>Series</h1>' +
    '<p class="lede">Posts that build on each other. Read a series in order, or jump to the part you need.</p></header>' +
    '<div class="stack">' + SERIES.map(seriesPanel).join('') + '</div></section>';
  return shell({ route: '/series/', nav: 'series', title: 'Series', desc: 'All series on ' + cfg.name + ': ' + SERIES.map(s => s.title).join(', ') + '.', body });
}

function pageSeries(s) {
  const ps = partsOf(s.slug), first = ps.filter(p => p.published)[0];
  const done = ps.filter(p => p.published).length;
  const body = '<section class="wrap page" style="--c:' + s.cssColor + '">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="' + href('/series/') + '">Series</a><span>/</span><span>' + esc(s.title) + '</span></nav>' +
    '<header class="series-head"><span class="eyebrow">' + done + ' of ' + ps.length + ' parts published</span>' +
      '<h1>' + esc(s.title) + '</h1><p class="lede">' + esc(s.long || s.blurb) + '</p>' + segs(ps) +
      (first ? '<a class="btn btn-c" href="' + href(postUrl(first)) + '">Start with part ' + first.part + '</a>' : '') +
    '</header>' +
    '<ol class="parts big">' + ps.map(p => partRow(p, true)).join('') + '</ol></section>';
  return shell({ route: seriesUrl(s), nav: 'series', title: s.title, desc: s.long || s.blurb, body });
}

function pagePost(p) {
  const s = p.series ? seriesBy[p.series] : null;
  const ps = s ? partsOf(s.slug) : [];
  const tags = p.tags.map(t => '<span class="meta">#' + esc(t) + '</span>').join('');
  const head = '<header class="post-head">' +
    '<div class="crumbs">' + (s
      ? '<a class="chip" style="--c:' + s.cssColor + '" href="' + href(seriesUrl(s)) + '"><i class="dot"></i>' + esc(s.title) + '</a><span>Part ' + p.part + ' of ' + ps.length + '</span>'
      : '<a href="' + href('/writing/') + '">Writing</a><span>/</span><span>Standalone</span>') + '</div>' +
    '<h1>' + esc(p.title) + '</h1><p class="lede">' + esc(p.dek) + '</p>' +
    '<div class="meta-row"><span class="meta">' + esc(cfg.author) + '</span><span class="meta"><time datetime="' + p.date + '">' + fmt(p.date) + '</time></span><span class="meta">' + p.words.toLocaleString('en-US') + ' words</span><span class="meta">' + p.minutes + ' min read</span>' + tags + '</div></header>';

  const toc = p.heads.length
    ? '<aside class="toc" aria-label="On this page"><span class="eyebrow">On this page</span>' +
      p.heads.map(h => '<a href="#' + h.id + '" class="lvl' + h.lvl + '">' + esc(h.text) + '</a>').join('') + '</aside>'
    : '';

  let foot;
  if (s) {
    const idx = ps.indexOf(p), prev = ps[idx - 1], next = ps[idx + 1];
    const card = (q, label, cls) => {
      if (!q) return '<div></div>';
      const inner = '<span class="meta">' + label + (q.published ? '' : ' (planned)') + '</span><span class="t">' + esc(q.title) + '</span>';
      return q.published
        ? '<a class="nav-card ' + cls + '" style="--c:' + s.cssColor + '" href="' + href(postUrl(q)) + '">' + inner + '</a>'
        : '<div class="nav-card is-planned ' + cls + '">' + inner + '</div>';
    };
    foot = '<nav class="series-nav" aria-label="Series navigation">' + card(prev, 'Previous', 'prev') + card(next, 'Next', 'next') + '</nav>';
  } else {
    const more = published.filter(q => q !== p).slice(0, 2);
    foot = '<div class="series-nav" style="grid-template-columns:1fr">' +
      '<div class="section-head" style="margin:0"><h2 style="font-size:22px">More to read</h2><a class="more" href="' + href('/writing/') + '">All writing &rarr;</a></div>' +
      '<div class="rows">' + more.map(q => rowHtml(q)).join('') + '</div></div>';
  }

  const body = '<section class="wrap page"><article class="post-layout"><div>' + head +
    '<div class="prose" id="article">' + p.html + '</div>' + foot + '</div>' + toc + '</article></section>';

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.dek,
    datePublished: p.date, dateModified: p.date, author: { '@type': 'Person', name: cfg.author }, keywords: p.tags.join(', ')
  };
  if (SITE) { jsonld.url = abs(postUrl(p)); jsonld.mainEntityOfPage = abs(postUrl(p)); }
  return shell({ route: postUrl(p), nav: 'writing', title: p.title, desc: p.dek, type: 'article', date: p.date, jsonld, body });
}

function pageAbout() {
  const body = '<section class="wrap page"><div class="about-grid"><div>' +
    '<h1>About</h1><p class="lede" style="margin-bottom:24px">I am ' + esc(cfg.author) + '.</p>' +
    '<div class="prose">' + cfg.about.map(t => '<p>' + esc(t) + '</p>').join('') + '</div></div>' +
    '<aside class="about-side">' +
      '<div><h2>Topics</h2><div class="tags">' + cfg.topics.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div></div>' +
      '<div><h2>Elsewhere</h2><div class="links">' + cfg.links.map(l =>
        '<a href="' + esc(l.href) + '" target="_blank" rel="noopener"><span>' + esc(l.label) + '</span><span aria-hidden="true">&nearr;</span></a>').join('') + '</div></div>' +
    '</aside></div></section>';
  return shell({ route: '/about/', nav: 'about', title: 'About', desc: cfg.about[0], body });
}

function page404() {
  const body = '<section class="wrap page"><h1>Page not found</h1><p class="lede">That link does not point to anything here.</p>' +
    '<p style="margin-top:24px"><a class="btn btn-primary" href="' + href('/') + '">Back home</a></p></section>';
  return shell({ route: '/404.html', title: 'Page not found', desc: 'Page not found.', body, noindex: true });
}

/* ------------------------------------------------------------------
   extras: sitemap, RSS feed, robots.txt
------------------------------------------------------------------ */
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function sitemap() {
  const urls = [['/', ''], ['/writing/', ''], ['/series/', ''], ['/about/', '']]
    .concat(SERIES.map(s => [seriesUrl(s), '']))
    .concat(published.map(p => [postUrl(p), p.date]));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + xml(abs(u[0])) + '</loc>' + (u[1] ? '<lastmod>' + u[1] + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
}

function feed() {
  const items = published.map(p => {
    const link = abs(postUrl(p));
    return '    <item>\n      <title>' + xml(p.title) + '</title>\n      <link>' + xml(link) + '</link>\n      <guid isPermaLink="true">' + xml(link) +
      '</guid>\n      <pubDate>' + new Date(p.date + 'T00:00:00Z').toUTCString() + '</pubDate>\n      <description>' + xml(p.dek) + '</description>\n    </item>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>' + xml(cfg.name) + '</title>\n    <link>' + xml(abs('/')) +
    '</link>\n    <description>' + xml(cfg.intro) + '</description>\n    <language>en</language>\n' + items + '\n  </channel>\n</rss>\n';
}

/* ------------------------------------------------------------------
   build
------------------------------------------------------------------ */
function write(rel, content) {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
const routeFile = route => (route.endsWith('/') ? route + 'index.html' : route).replace(/^\//, '');

function build(quiet) {
  load();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });

  write(routeFile('/'), pageHome());
  write(routeFile('/writing/'), pageWriting());
  write(routeFile('/series/'), pageSeriesIndex());
  write(routeFile('/about/'), pageAbout());
  SERIES.forEach(s => write(routeFile(seriesUrl(s)), pageSeries(s)));
  published.forEach(p => write(routeFile(postUrl(p)), pagePost(p)));
  write('404.html', page404());
  write('.nojekyll', '');
  write('robots.txt', 'User-agent: *\nAllow: /\n' + (SITE ? 'Sitemap: ' + abs('/sitemap.xml') + '\n' : ''));
  if (SITE) { write('sitemap.xml', sitemap()); write('feed.xml', feed()); }

  if (!quiet) {
    const planned = POSTS.length - published.length;
    console.log('Built ' + (4 + SERIES.length + published.length + 1) + ' pages into dist/  (' + published.length + ' posts, ' + planned + ' planned, ' + SERIES.length + ' series)');
    if (!SITE) console.log('Note: "url" is empty in site.config.json, so canonical links, sitemap.xml and feed.xml were skipped.');
  }
}

/* ------------------------------------------------------------------
   dev server
------------------------------------------------------------------ */
function serve(port) {
  build();
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
  http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (BASE && u.indexOf(BASE) === 0) u = u.slice(BASE.length) || '/';
    if (!/\.[a-z0-9]+$/i.test(u)) { try { build(true); } catch (e) { console.error(e.message); } }
    let f = path.normalize(path.join(DIST, u));
    if (f !== DIST && f.indexOf(DIST + path.sep) !== 0) { res.writeHead(403); res.end('Forbidden'); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    let status = 200;
    if (!fs.existsSync(f)) { f = path.join(DIST, '404.html'); status = 404; }
    res.writeHead(status, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(port, () => console.log('Serving http://localhost:' + port + (BASE || '') + '/  (Ctrl+C to stop)'));
}

const cmd = process.argv[2];
try {
  if (cmd === 'serve') serve(Number(process.argv[3]) || 8080);
  else build();
} catch (e) {
  console.error('Build failed: ' + e.message);
  process.exit(1);
}
