import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { dirname } from 'path';
import { marked } from 'marked';
import { readJSON, resolveDataPath } from './lib/utils.js';

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function buildArticleData(article) {
  const mdPath = resolveDataPath(`data/articles/${article.id}.md`);
  const zhPath = resolveDataPath(`data/articles/${article.id}.zh.md`);

  let contentHtml = '';
  let zhContentHtml = '';

  if (await fileExists(mdPath)) {
    const md = await readFile(mdPath, 'utf-8');
    contentHtml = marked(md);
  }
  if (await fileExists(zhPath)) {
    const zhMd = await readFile(zhPath, 'utf-8');
    zhContentHtml = marked(zhMd);
  }

  return {
    ...article,
    contentHtml,
    zhContentHtml: zhContentHtml || undefined,
  };
}

function generateIndexHTML(articles, episodes) {
  const readyArticles = articles
    .filter(a => a.status === 'ready')
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const articleItems = readyArticles.map(a => {
    const date = new Date(a.savedAt).toLocaleDateString('zh-CN');
    return `<li class="article-item" data-saved-at="${a.savedAt}">
      <a href="article.html?id=${a.id}">${escapeHtml(a.title || a.url)}</a>
      <div class="meta">
        <span class="site">${escapeHtml(a.siteName || '')}</span>
        <span class="date">${date}</span>
        ${a.language && a.language !== 'zh' ? `<span class="lang">${a.language.toUpperCase()}</span>` : ''}
      </div>
      ${a.summary ? `<p class="summary">${escapeHtml(a.summary)}</p>` : ''}
    </li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Readit</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1><a href="/">Readit</a></h1>
    <nav>
      <a href="index.html" class="active">Articles</a>
      <a href="curation.html">Curation</a>
    </nav>
  </header>
  <main>
    <div class="filters">
      <button class="filter active" data-filter="all">All</button>
      <button class="filter" data-filter="week">Week</button>
      <button class="filter" data-filter="month">Month</button>
    </div>
    <div class="search-box">
      <input type="text" id="search" placeholder="Search articles..." />
    </div>
    <ul class="article-list">
      ${articleItems}
    </ul>
    ${readyArticles.length === 0 ? '<p class="empty">No articles yet.</p>' : ''}
  </main>
  <script>
    const filters = document.querySelectorAll('.filter');
    const items = document.querySelectorAll('.article-item');
    const searchInput = document.getElementById('search');

    function applyFilters() {
      const activeFilter = document.querySelector('.filter.active').dataset.filter;
      const query = searchInput.value.toLowerCase().trim();
      const now = new Date();

      items.forEach(item => {
        const savedAt = new Date(item.dataset.savedAt);
        const diffDays = (now - savedAt) / (1000 * 60 * 60 * 24);

        let timeVisible = true;
        if (activeFilter === 'week') timeVisible = diffDays <= 7;
        if (activeFilter === 'month') timeVisible = diffDays <= 30;

        let searchVisible = true;
        if (query) {
          const text = item.textContent.toLowerCase();
          searchVisible = text.includes(query);
        }

        item.style.display = (timeVisible && searchVisible) ? '' : 'none';
      });
    }

    filters.forEach(btn => {
      btn.addEventListener('click', () => {
        filters.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
    });

    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 200);
    });
  </script>
</body>
</html>`;
}

function generateArticleHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loading... — Readit</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1><a href="/">Readit</a></h1>
    <nav>
      <a href="index.html">Articles</a>
      <a href="curation.html">Curation</a>
    </nav>
  </header>
  <main>
    <article id="article">
      <div class="article-header">
        <h2 id="article-title">Loading...</h2>
        <div class="meta" id="article-meta"></div>
        <div class="lang-toggle" id="lang-toggle" style="display:none">
          <button class="lang-btn active" data-mode="bilingual">双语</button>
          <button class="lang-btn" data-mode="english">English</button>
          <button class="lang-btn" data-mode="chinese">中文</button>
        </div>
      </div>
      <div id="article-content" class="article-content bilingual"></div>
    </article>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id) {
      document.getElementById('article-title').textContent = 'Article not found';
    } else {
      fetch(\`data/articles/\${id}.json\`)
        .then(r => r.json())
        .then(article => {
          document.title = \`\${article.title} — Readit\`;
          document.getElementById('article-title').textContent = article.title;

          const date = new Date(article.savedAt).toLocaleDateString('zh-CN');
          document.getElementById('article-meta').innerHTML =
            \`<span class="site">\${article.siteName || ''}</span>
             <span class="date">\${date}</span>
             <a href="\${article.url}" target="_blank" rel="noopener">Original</a>\`;

          // Use translated version if available, otherwise original
          const content = article.zhContentHtml || article.contentHtml;
          document.getElementById('article-content').innerHTML = content;

          // Show language toggle for bilingual content
          if (article.zhContentHtml) {
            const toggle = document.getElementById('lang-toggle');
            toggle.style.display = 'flex';

            const contentEl = document.getElementById('article-content');
            const saved = localStorage.getItem('readit-lang-mode');
            if (saved) {
              contentEl.className = \`article-content \${saved}\`;
              toggle.querySelectorAll('.lang-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === saved);
              });
            }

            toggle.addEventListener('click', e => {
              if (!e.target.matches('.lang-btn')) return;
              const mode = e.target.dataset.mode;
              toggle.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
              e.target.classList.add('active');
              contentEl.className = \`article-content \${mode}\`;
              localStorage.setItem('readit-lang-mode', mode);
            });
          }
        })
        .catch(() => {
          document.getElementById('article-title').textContent = 'Failed to load article';
        });
    }
  </script>
</body>
</html>`;
}

function generateCurationHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Curation — Readit</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1><a href="/">Readit</a></h1>
    <nav>
      <a href="index.html">Articles</a>
      <a href="curation.html" class="active">Curation</a>
    </nav>
  </header>
  <main>
    <h2>Daily Curation</h2>
    <div id="episodes"></div>
    <p class="empty" id="empty-msg">No episodes yet.</p>
  </main>
  <script>
    fetch('data/episodes.json')
      .then(r => r.json())
      .then(episodes => {
        if (!episodes.length) return;
        document.getElementById('empty-msg').style.display = 'none';
        const container = document.getElementById('episodes');
        episodes.sort((a, b) => new Date(b.date) - new Date(a.date));
        episodes.forEach(ep => {
          const div = document.createElement('div');
          div.className = 'episode';
          div.innerHTML = \`
            <h3>\${ep.title || ep.date}</h3>
            <div class="audio-player">
              <audio controls preload="metadata">
                <source src="\${ep.audioUrl}" type="audio/mpeg">
              </audio>
              <div class="speed-controls">
                <button onclick="this.closest('.audio-player').querySelector('audio').playbackRate=0.5">0.5x</button>
                <button onclick="this.closest('.audio-player').querySelector('audio').playbackRate=1">1x</button>
                <button onclick="this.closest('.audio-player').querySelector('audio').playbackRate=1.5">1.5x</button>
                <button onclick="this.closest('.audio-player').querySelector('audio').playbackRate=2">2x</button>
              </div>
            </div>
            <details>
              <summary>Show summary</summary>
              <div class="episode-summary">\${ep.summary || ''}</div>
            </details>
            <div class="episode-articles">
              \${(ep.articleIds || []).map(id =>
                \`<a href="article.html?id=\${id}">\${id}</a>\`
              ).join(' · ')}
            </div>\`;
          container.appendChild(div);
        });
      })
      .catch(() => {});
  </script>
</body>
</html>`;
}

function generateCSS() {
  return `*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #ffffff;
  --text: #1a1a1a;
  --text-secondary: #666;
  --border: #e0e0e0;
  --accent: #1a73e8;
  --accent-hover: #1557b0;
  --card-bg: #f8f9fa;
  --blockquote-bg: #f5f5f5;
  --blockquote-border: #ddd;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --text: #e0e0e0;
    --text-secondary: #999;
    --border: #333;
    --accent: #6db3f2;
    --accent-hover: #8ec5f5;
    --card-bg: #242424;
    --blockquote-bg: #242424;
    --blockquote-border: #444;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 18px;
  line-height: 1.7;
  color: var(--text);
  background: var(--bg);
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
header h1 {
  font-size: 1.4rem;
}
header h1 a {
  color: var(--text);
}
header nav {
  display: flex;
  gap: 1rem;
}
header nav a.active {
  font-weight: 600;
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.filter {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text);
}
.filter.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.search-box {
  margin-bottom: 1.5rem;
}
.search-box input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 1rem;
  background: var(--bg);
  color: var(--text);
}

.article-list {
  list-style: none;
}
.article-item {
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
}
.article-item a {
  font-size: 1.1rem;
  font-weight: 500;
  line-height: 1.4;
}
.meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}
.lang {
  background: var(--card-bg);
  padding: 0 0.3rem;
  border-radius: 3px;
  font-size: 0.75rem;
}
.summary {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  line-height: 1.5;
}
.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 3rem 0;
}

/* Article page */
.article-header {
  margin-bottom: 2rem;
}
.article-header h2 {
  font-size: 1.6rem;
  line-height: 1.3;
  margin-bottom: 0.5rem;
}

.lang-toggle {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
.lang-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text);
}
.lang-btn.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.article-content {
  line-height: 1.8;
}
.article-content h1, .article-content h2, .article-content h3 {
  margin: 1.5rem 0 0.75rem;
  line-height: 1.3;
}
.article-content p {
  margin-bottom: 1rem;
}
.article-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.article-content blockquote {
  border-left: 3px solid var(--blockquote-border);
  padding: 0.5rem 1rem;
  margin: 0.5rem 0;
  background: var(--blockquote-bg);
  color: var(--text-secondary);
  font-size: 0.95rem;
}
.article-content pre {
  background: var(--card-bg);
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
.article-content code {
  background: var(--card-bg);
  padding: 0.15rem 0.3rem;
  border-radius: 3px;
  font-size: 0.9em;
}
.article-content pre code {
  background: none;
  padding: 0;
}

/* Bilingual modes */
.article-content.english blockquote {
  border-left: none;
  padding: 0;
  margin: 0 0 1rem;
  background: none;
  color: var(--text);
  font-size: inherit;
}
.article-content.english p {
  display: none;
}
.article-content.english blockquote + p {
  display: none;
}

.article-content.chinese blockquote {
  display: none;
}

.article-content.bilingual blockquote {
  margin-bottom: 0.25rem;
}

/* Curation page */
.episode {
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--border);
}
.episode h3 {
  margin-bottom: 0.75rem;
}
.audio-player {
  margin-bottom: 0.75rem;
}
.audio-player audio {
  width: 100%;
}
.speed-controls {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.speed-controls button {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--text);
}
.episode-summary {
  margin-top: 0.5rem;
  line-height: 1.6;
}
.episode-articles {
  margin-top: 0.75rem;
  font-size: 0.85rem;
}
`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Main build
const articles = await readJSON('data/articles.json');
const episodes = await readJSON('data/episodes.json');

// Ensure output dirs
await mkdir(resolveDataPath('site/data/articles'), { recursive: true });

// Build per-article JSON files
for (const article of articles.filter(a => a.status === 'ready')) {
  const data = await buildArticleData(article);
  const outPath = resolveDataPath(`site/data/articles/${article.id}.json`);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
}

// Write site data indexes
await writeFile(
  resolveDataPath('site/data/articles.json'),
  JSON.stringify(articles, null, 2),
  'utf-8'
);
await writeFile(
  resolveDataPath('site/data/episodes.json'),
  JSON.stringify(episodes, null, 2),
  'utf-8'
);

// Generate HTML pages
await writeFile(resolveDataPath('site/index.html'), generateIndexHTML(articles, episodes), 'utf-8');
await writeFile(resolveDataPath('site/article.html'), generateArticleHTML(), 'utf-8');
await writeFile(resolveDataPath('site/curation.html'), generateCurationHTML(), 'utf-8');
await writeFile(resolveDataPath('site/style.css'), generateCSS(), 'utf-8');

console.log(`Built site: ${articles.filter(a => a.status === 'ready').length} articles, ${episodes.length} episodes`);
