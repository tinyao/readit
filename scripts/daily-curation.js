import OpenAI from 'openai';
import OSS from 'ali-oss';
import { readJSON, writeJSON } from './lib/utils.js';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function generateCurationText(articles) {
  const articleSummaries = articles.map((a, i) =>
    `${i + 1}. 《${a.title}》(${a.siteName})\n   ${a.summary}`
  ).join('\n\n');

  const completion = await openai.chat.completions.create({
    model: 'anthropic/claude-sonnet-4',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `你是一个播客主持人，请根据以下今日文章，生成一段中文播客文稿（800-1500字）。
要求：
- 用自然口语化的风格
- 简要串联每篇文章的要点
- 开头有简短问候，结尾有总结
- 不要使用 Markdown 格式

今日文章：
${articleSummaries}`,
    }],
  });

  return completion.choices[0].message.content;
}

async function generateAudio(text) {
  // Split text at sentence boundaries, each chunk ≤ 4096 chars
  const sentences = text.match(/[^。！？.!?]+[。！？.!?]+/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > 4096) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);

  const buffers = [];
  for (const chunk of chunks) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: chunk,
        voice: 'nova',
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI TTS failed: ${res.status} ${res.statusText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    buffers.push(buffer);
  }

  return Buffer.concat(buffers);
}

async function uploadToOSS(buffer, filename) {
  const client = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
  });

  const result = await client.put(`episodes/${filename}`, buffer);
  return result.url;
}

// Main
const today = getTodayDate();
const articles = await readJSON('data/articles.json');
const episodes = await readJSON('data/episodes.json');

// Idempotent: skip if episode for today exists
if (episodes.some(ep => ep.date === today)) {
  console.log(`Episode for ${today} already exists, skipping.`);
  process.exit(0);
}

// Filter articles ready in last 24h
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const todayArticles = articles.filter(a =>
  a.status === 'ready' && a.savedAt >= oneDayAgo
);

if (todayArticles.length === 0) {
  console.log('No articles from last 24h, skipping curation.');
  process.exit(0);
}

console.log(`Generating curation for ${todayArticles.length} articles...`);

// Generate podcast text
const curationText = await generateCurationText(todayArticles);
console.log(`Generated text: ${curationText.length} chars`);

// Generate audio
console.log('Generating audio...');
const audioBuffer = await generateAudio(curationText);
console.log(`Generated audio: ${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB`);

// Upload to OSS
const filename = `ep-${today}.mp3`;
console.log(`Uploading ${filename} to OSS...`);
const audioUrl = await uploadToOSS(audioBuffer, filename);
console.log(`Uploaded: ${audioUrl}`);

// Save episode
const episode = {
  date: today,
  title: `Daily Curation — ${today}`,
  summary: curationText,
  audioUrl,
  articleIds: todayArticles.map(a => a.id),
  createdAt: new Date().toISOString(),
};

episodes.push(episode);
await writeJSON('data/episodes.json', episodes);

console.log(`Episode saved: ${episode.title}`);
