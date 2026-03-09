import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { readJSON, writeJSON, resolveDataPath } from './lib/utils.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

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

async function claudeSummarize(article, markdown) {
  const prompt = `You are analyzing an article. Return a JSON object with exactly these fields:
- "language": the article's primary language as ISO 639-1 code (e.g. "en", "zh", "ja")
- "summary": a Chinese summary of the article in 3-5 sentences

Article title: ${article.title || 'Unknown'}
Article content (first 8000 chars):
${markdown.slice(0, 8000)}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text;
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

async function claudeTranslate(markdown) {
  const prompt = `Translate the following English Markdown article into Chinese using immersive translation format.

Rules:
- For each paragraph, output the original English as a blockquote (> prefix), followed by the Chinese translation as normal text
- Keep Markdown headings, lists, code blocks, and links intact
- Do not translate code blocks or URLs
- Output Markdown only, no explanations

Article:
${markdown.slice(0, 12000)}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

// Main processing
const articles = await readJSON('data/articles.json');
let updated = false;

for (const article of articles) {
  // Stage A: Jina fetch (pending → fetched)
  if (article.status === 'pending') {
    console.log(`Fetching: ${article.id} — ${article.url}`);
    try {
      const markdown = await fetchWithJina(article.url);
      const title = extractTitle(markdown) || article.url;
      const siteName = extractSiteName(article.url);

      // Save markdown
      const mdPath = resolveDataPath(`data/articles/${article.id}.md`);
      await mkdir(dirname(mdPath), { recursive: true });
      await writeFile(mdPath, markdown, 'utf-8');

      article.title = title;
      article.siteName = siteName;
      article.status = 'fetched';
      article.fetchedAt = new Date().toISOString();
      updated = true;
      console.log(`  Fetched: ${title}`);
    } catch (err) {
      article.status = 'error';
      article.error = err.message;
      updated = true;
      console.error(`  Error fetching: ${err.message}`);
    }
    // Save after each article for crash safety
    await writeJSON('data/articles.json', articles);
  }

  // Stage B: Claude AI (fetched → ready)
  if (article.status === 'fetched') {
    console.log(`Processing: ${article.id} — ${article.title}`);
    try {
      const mdPath = resolveDataPath(`data/articles/${article.id}.md`);
      const markdown = await readFile(mdPath, 'utf-8');

      // Call 1: language detection + summary
      const analysis = await claudeSummarize(article, markdown);
      article.language = analysis.language;
      article.summary = analysis.summary;

      // Call 2: immersive translation for English articles
      if (analysis.language === 'en') {
        console.log(`  Translating to Chinese...`);
        const translated = await claudeTranslate(markdown);
        const zhPath = resolveDataPath(`data/articles/${article.id}.zh.md`);
        await writeFile(zhPath, translated, 'utf-8');
      }

      article.status = 'ready';
      article.processedAt = new Date().toISOString();
      updated = true;
      console.log(`  Ready: ${article.title}`);
    } catch (err) {
      // Stay fetched, will retry next run
      console.error(`  Error processing: ${err.message}`);
    }
    // Save after each article for crash safety
    await writeJSON('data/articles.json', articles);
  }
}

if (!updated) {
  console.log('No articles to process.');
}
