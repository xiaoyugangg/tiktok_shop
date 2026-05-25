import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

export const STORAGE_ROOT = path.isAbsolute(env.STORAGE_ROOT)
  ? env.STORAGE_ROOT
  : path.resolve(REPO_ROOT, env.STORAGE_ROOT);

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export function absFromRelative(rel: string) {
  return path.join(STORAGE_ROOT, rel);
}

export function relativeFromAbs(abs: string) {
  return path.relative(STORAGE_ROOT, abs).split(path.sep).join('/');
}

export function publicUrlForRelative(rel: string) {
  const cleaned = rel.split(path.sep).join('/').replace(/^\/+/, '');
  return `${env.PUBLIC_BASE_URL}/static/${cleaned}`;
}

export async function initStorage() {
  await ensureDir(STORAGE_ROOT);
  await ensureDir(path.join(STORAGE_ROOT, 'uploads'));
  await ensureDir(path.join(STORAGE_ROOT, 'tasks'));
  await ensureDir(path.join(STORAGE_ROOT, 'logs'));
}
