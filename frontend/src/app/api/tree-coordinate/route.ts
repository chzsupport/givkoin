import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const COORDINATE_FILE_PATH = path.join(process.cwd(), '..', 'docs', 'coordinate.txt');

export async function GET() {
  try {
    const content = await readFile(COORDINATE_FILE_PATH, 'utf8');
    return new Response(content, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to read tree coordinate file:', error);
    return new Response('Failed to read tree coordinate file', { status: 500 });
  }
}
