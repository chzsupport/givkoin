import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ENTITY_AVATARS_DIR = path.join(process.cwd(), 'public', 'entitycollect');
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function getNumericSortValue(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const numeric = Number(baseName);
  if (Number.isFinite(numeric)) return numeric;
  return Number.MAX_SAFE_INTEGER;
}

export async function GET() {
  try {
    const entries = await readdir(ENTITY_AVATARS_DIR, { withFileTypes: true });
    const items = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) => ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
      .sort((a, b) => {
        const aNum = getNumericSortValue(a);
        const bNum = getNumericSortValue(b);
        if (aNum !== bNum) return aNum - bNum;
        return a.localeCompare(b, 'en');
      })
      .map((fileName) => `/entitycollect/${fileName}`);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Failed to read entity avatars directory:', error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
