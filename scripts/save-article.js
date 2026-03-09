import { readJSON, writeJSON, generateId } from './lib/utils.js';

const url = process.env.ARTICLE_URL || process.argv[2];

if (!url) {
  console.error('Usage: ARTICLE_URL=<url> node scripts/save-article.js');
  console.error('   or: node scripts/save-article.js <url>');
  process.exit(1);
}

// Validate URL
try {
  new URL(url);
} catch {
  console.error(`Invalid URL: ${url}`);
  process.exit(1);
}

const articles = await readJSON('data/articles.json');

// Duplicate check
const existing = articles.find(a => a.url === url);
if (existing) {
  console.log(`Article already exists: ${existing.id} (${existing.url})`);
  process.exit(0);
}

// Detect source type
const hostname = new URL(url).hostname;
const sourceType = (hostname.includes('twitter.com') || hostname.includes('x.com'))
  ? 'twitter'
  : 'web';

const article = {
  id: generateId(),
  url,
  sourceType,
  status: 'pending',
  savedAt: new Date().toISOString(),
};

articles.push(article);
await writeJSON('data/articles.json', articles);

console.log(`Saved article: ${article.id} (${url})`);
