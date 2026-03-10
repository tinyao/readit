import { writeFile, mkdir } from 'fs/promises';
import { readJSON, resolveDataPath } from './lib/utils.js';

const HEAD_COMMON = `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=Source+Sans+3:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">`;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateIndexHTML(articles) {
  const readyArticles = articles
    .filter(a => a.status === 'ready')
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const articleItems = readyArticles.map((a, i) => {
    const date = new Date(a.savedAt);
    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `<li class="article-item" data-saved-at="${a.savedAt}" style="animation-delay: ${i * 60}ms">
          <a class="article-title" href="article.html?id=${a.id}">${escapeHtml(a.title || a.url)}</a>
          <div class="meta">
            <span class="date">${month} ${day}, ${year}</span>
            <span class="sep">·</span>
            <span class="site">${escapeHtml(a.siteName || '')}</span>
          </div>
      </li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  ${HEAD_COMMON}
  <title>Readit</title>
</head>
<body>
  <header>
    <a href="/" class="logo">Readit</a>
  </header>
  <main>
    <div class="toolbar">
      <div class="filters">
        <button class="filter active" data-filter="all">All</button>
        <button class="filter" data-filter="week">This Week</button>
        <button class="filter" data-filter="month">This Month</button>
      </div>
      <div class="search-box">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="search" placeholder="Search..." />
      </div>
    </div>
    <ul class="article-list">
      ${articleItems}
    </ul>
    ${readyArticles.length === 0 ? '<p class="empty">Nothing here yet. Save your first article.</p>' : ''}
  </main>
  <footer>
    <span class="footer-count">${readyArticles.length} article${readyArticles.length !== 1 ? 's' : ''} saved</span>
  </footer>
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
  ${HEAD_COMMON}
  <title>Loading... — Readit</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
</head>
<body class="article-page">
  <header>
    <a href="/" class="logo">Readit</a>
  </header>
  <main>
    <article id="article">
      <div class="article-header">
        <h1 id="article-title" class="loading-text">Loading...</h1>
        <div class="meta" id="article-meta"></div>
      </div>
      <div class="article-divider"></div>
      <div id="article-content" class="article-content"></div>
    </article>
  </main>
  <footer>
    <a href="index.html" class="back-link">Back to articles</a>
  </footer>
  <script>
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id) {
      document.getElementById('article-title').textContent = 'Article not found';
      document.getElementById('article-title').classList.remove('loading-text');
    } else {
      // Fetch article metadata and markdown in parallel
      Promise.all([
        fetch('articles.json').then(r => r.json()),
        fetch(\`articles/\${id}.md\`).then(r => r.text())
      ])
        .then(([articles, markdown]) => {
          const article = articles.find(a => a.id === id);
          if (!article) throw new Error('Not found');

          document.title = \`\${article.title} — Readit\`;
          const titleEl = document.getElementById('article-title');
          titleEl.textContent = article.title;
          titleEl.classList.remove('loading-text');

          const date = new Date(article.savedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
          document.getElementById('article-meta').innerHTML =
            \`<span class="site">\${article.siteName || ''}</span>
             <span class="sep">·</span>
             <span class="date">\${date}</span>
             <span class="sep">·</span>
             <a href="\${article.url}" target="_blank" rel="noopener">Original</a>\`;

          document.getElementById('article-content').innerHTML = marked.parse(markdown);
        })
        .catch(() => {
          const titleEl = document.getElementById('article-title');
          titleEl.textContent = 'Failed to load article';
          titleEl.classList.remove('loading-text');
        });
    }
  <\/script>
</body>
</html>`;
}

function generateCSS() {
  return `@charset "UTF-8";

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --font-serif: "Newsreader", "Georgia", "Noto Serif SC", "Source Han Serif SC", serif;
  --font-sans: "Source Sans 3", "Helvetica Neue", "PingFang SC", "Noto Sans SC", sans-serif;

  --bg: #faf8f5;
  --bg-surface: #f2eeea;
  --text: #2c2825;
  --text-secondary: #8a8279;
  --text-tertiary: #b5ada5;
  --border: #e8e2db;
  --accent: #c45d3e;
  --accent-hover: #a84b30;
  --accent-subtle: rgba(196, 93, 62, 0.08);
  --blockquote-bg: #f0ece7;
  --blockquote-border: #d4cdc5;
  --shadow-sm: 0 1px 2px rgba(44, 40, 37, 0.04);
  --radius: 8px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1a18;
    --bg-surface: #252220;
    --text: #e8e2db;
    --text-secondary: #8a8279;
    --text-tertiary: #5c564f;
    --border: #352f2b;
    --accent: #e07a5c;
    --accent-hover: #e99479;
    --accent-subtle: rgba(224, 122, 92, 0.1);
    --blockquote-bg: #282422;
    --blockquote-border: #3d3733;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
}

html {
  scroll-behavior: smooth;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  max-width: 720px;
  margin: 0 auto;
  padding: 0 1.5rem;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ---- Header ---- */

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2rem 0 1.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2.5rem;
}

.logo {
  font-family: var(--font-serif);
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--text);
  text-decoration: none;
  letter-spacing: -0.02em;
  transition: color var(--transition);
}
.logo:hover {
  color: var(--accent);
}

/* ---- Main ---- */

main {
  flex: 1;
}

/* ---- Toolbar ---- */

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
}

.filters {
  display: flex;
  gap: 0.25rem;
}
.filter {
  background: none;
  border: none;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--text-tertiary);
  border-radius: 100px;
  transition: all var(--transition);
  letter-spacing: 0.01em;
}
.filter:hover {
  color: var(--text-secondary);
  background: var(--accent-subtle);
}
.filter.active {
  background: var(--text);
  color: var(--bg);
  font-weight: 500;
}

.search-box {
  position: relative;
  width: 180px;
}
.search-icon {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.search-box input {
  width: 100%;
  padding: 0.4rem 0.65rem 0.4rem 2rem;
  border: 1px solid var(--border);
  border-radius: 100px;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  background: transparent;
  color: var(--text);
  outline: none;
  transition: all var(--transition);
}
.search-box input::placeholder {
  color: var(--text-tertiary);
}
.search-box input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

/* ---- Article List ---- */

.article-list {
  list-style: none;
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.article-item {
  display: flex;
  flex-direction: column;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--border);
  animation: fadeSlideIn 0.4s ease-out both;
  transition: background var(--transition);
}
.article-item:first-child {
  border-top: 1px solid var(--border);
}
.article-item:hover {
  background: var(--accent-subtle);
  margin: 0 -1rem;
  padding-left: 1rem;
  padding-right: 1rem;
  border-radius: var(--radius);
}

.article-title {
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 400;
  line-height: 1.45;
  color: var(--text);
  text-decoration: none;
  transition: color var(--transition);
  display: block;
  margin-bottom: 0.3rem;
}
.article-title:hover {
  color: var(--accent);
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 0.35rem;
  letter-spacing: 0.02em;
}
.meta .sep {
  opacity: 0.4;
}
.meta a {
  color: var(--accent);
  text-decoration: none;
  transition: color var(--transition);
}
.meta a:hover {
  color: var(--accent-hover);
}

.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 5rem 2rem;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 1rem;
}

/* ---- Article Page ---- */

.article-page main {
  max-width: 640px;
  margin: 0 auto;
}

.article-header {
  margin-bottom: 2rem;
}
.article-header h1 {
  font-family: var(--font-serif);
  font-size: 2rem;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: var(--text);
  margin-bottom: 0.75rem;
}
.article-header h1.loading-text {
  color: var(--text-tertiary);
  font-style: italic;
}

.article-divider {
  width: 3rem;
  height: 2px;
  background: var(--accent);
  margin-bottom: 2rem;
  border-radius: 1px;
}

.article-content {
  font-family: var(--font-serif);
  font-size: 1.1rem;
  line-height: 1.85;
  color: var(--text);
}
.article-content h1, .article-content h2, .article-content h3 {
  font-family: var(--font-sans);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}
.article-content h1 {
  font-size: 1.5rem;
  margin: 2.5rem 0 1rem;
}
.article-content h2 {
  font-size: 1.3rem;
  margin: 2rem 0 0.75rem;
}
.article-content h3 {
  font-size: 1.1rem;
  margin: 1.5rem 0 0.5rem;
}
.article-content p {
  margin-bottom: 1.2rem;
}
.article-content img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
  margin: 1rem 0;
}
.article-content blockquote {
  border-left: 2px solid var(--blockquote-border);
  padding: 0.25rem 1.25rem;
  margin: 0.75rem 0;
  color: var(--text-secondary);
  font-size: 1rem;
  font-style: italic;
}
.article-content pre {
  background: var(--bg-surface);
  padding: 1.25rem;
  border-radius: var(--radius);
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.6;
  margin-bottom: 1.2rem;
  border: 1px solid var(--border);
}
.article-content code {
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  background: var(--bg-surface);
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  font-size: 0.85em;
}
.article-content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}
.article-content a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: rgba(196, 93, 62, 0.3);
  text-underline-offset: 2px;
  transition: text-decoration-color var(--transition);
}
.article-content a:hover {
  text-decoration-color: var(--accent);
}
.article-content ul, .article-content ol {
  margin: 0.5rem 0 1.2rem 1.5rem;
}
.article-content li {
  margin-bottom: 0.4rem;
}
.article-content hr {
  border: none;
  height: 1px;
  background: var(--border);
  margin: 2rem 0;
}

/* ---- Footer ---- */

footer {
  padding: 2.5rem 0 2rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  letter-spacing: 0.03em;
}
.footer-count {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.back-link {
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color var(--transition);
}
.back-link:hover {
  color: var(--accent);
}

/* ---- Responsive ---- */

@media (max-width: 600px) {
  body {
    padding: 0 1rem;
  }
  header {
    padding: 1.5rem 0 1rem;
    margin-bottom: 1.5rem;
  }
  .logo {
    font-size: 1.25rem;
  }
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .search-box {
    width: 100%;
  }
  .article-item {
    padding: 1rem 0;
  }
  .article-header h1 {
    font-size: 1.6rem;
  }
}
`;
}

// Main build
const articles = await readJSON('docs/articles.json');

// Generate HTML pages
await mkdir(resolveDataPath('docs'), { recursive: true });
await writeFile(resolveDataPath('docs/index.html'), generateIndexHTML(articles), 'utf-8');
await writeFile(resolveDataPath('docs/article.html'), generateArticleHTML(), 'utf-8');
await writeFile(resolveDataPath('docs/style.css'), generateCSS(), 'utf-8');

console.log(`Built site: ${articles.filter(a => a.status === 'ready').length} articles`);
