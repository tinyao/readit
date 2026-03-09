import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..', '..');

// Auto-load .env when not in GitHub Actions
if (!process.env.GITHUB_ACTIONS) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: join(PROJECT_ROOT, '.env') });
}

export function resolveDataPath(relativePath) {
  return join(PROJECT_ROOT, relativePath);
}

export async function readJSON(path) {
  const fullPath = resolveDataPath(path);
  const content = await readFile(fullPath, 'utf-8');
  return JSON.parse(content);
}

export async function writeJSON(path, data) {
  const fullPath = resolveDataPath(path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function generateId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex');
  return `${date}-${random}`;
}
