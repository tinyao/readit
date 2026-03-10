import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { readJSON, writeJSON, resolveDataPath } from './lib/utils.js';

async function fetchWithJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers = { Accept: 'text/markdown' };
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }
  const res = await fetch(jinaUrl, { headers });
  if (!res.ok) {
    throw new Error(`Jina fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractSiteName(url) {
  const hostname = new URL(url).hostname;
  return hostname.replace(/^www\./, '');
}

// Main processing
const articles = await readJSON('docs/articles.json');
let updated = false;

for (const article of articles) {
  if (article.status !== 'pending') continue;

  console.log(`Fetching: ${article.id} — ${article.url}`);
  try {
    const markdown = await fetchWithJina(article.url);
    const title = extractTitle(markdown) || article.url;
    const siteName = extractSiteName(article.url);

    const mdPath = resolveDataPath(`docs/articles/${article.id}.md`);
    await mkdir(dirname(mdPath), { recursive: true });
    await writeFile(mdPath, markdown, 'utf-8');

    article.title = title;
    article.siteName = siteName;
    article.status = 'ready';
    article.processedAt = new Date().toISOString();
    updated = true;
    console.log(`  Ready: ${title}`);
  } catch (err) {
    article.status = 'error';
    article.error = err.message;
    updated = true;
    console.error(`  Error fetching: ${err.message}`);
  }
  // Save after each article for crash safety
  await writeJSON('docs/articles.json', articles);
}

if (!updated) {
  console.log('No articles to process.');
}
