import {
  getStaticPagesContent,
  parseStaticPagesContent,
  type StaticPagesContent,
} from './staticPages';

export type PageTextBundle = StaticPagesContent;

export function parsePageTextBundle(data: unknown): PageTextBundle {
  return parseStaticPagesContent(data);
}

export async function getPageTextBundle(): Promise<PageTextBundle> {
  return getStaticPagesContent();
}
