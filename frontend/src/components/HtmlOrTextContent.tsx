'use client';

import { useI18n } from '@/context/I18nContext';

type HtmlOrTextContentProps = {
  content: string;
  emptyState?: string;
  className?: string;
};

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const HTML_CONTENT_CLASS_NAME = [
  'max-w-none',
  'whitespace-normal',
  '[&_h1]:mb-4',
  '[&_h1]:text-h2',
  '[&_h1]:text-white',
  '[&_h2]:mb-3',
  '[&_h2]:text-h3',
  '[&_h2]:text-white',
  '[&_h3]:mb-3',
  '[&_h3]:text-body',
  '[&_h3]:font-bold',
  '[&_h3]:text-white',
  '[&_p]:mb-4',
  '[&_p:last-child]:mb-0',
  '[&_ul]:mb-4',
  '[&_ul]:list-disc',
  '[&_ul]:pl-6',
  '[&_ol]:mb-4',
  '[&_ol]:list-decimal',
  '[&_ol]:pl-6',
  '[&_li]:mb-1',
  '[&_strong]:font-semibold',
  '[&_strong]:text-white',
  '[&_em]:italic',
  '[&_a]:text-cyan-300',
  '[&_a]:underline',
  '[&_a]:underline-offset-4',
  '[&_blockquote]:border-l',
  '[&_blockquote]:border-white/15',
  '[&_blockquote]:pl-4',
  '[&_blockquote]:text-white/80',
].join(' ');

function looksLikeHtml(value: string) {
  return HTML_TAG_PATTERN.test(value);
}

export default function HtmlOrTextContent({
  content,
  emptyState,
  className = '',
}: HtmlOrTextContentProps) {
  const { t } = useI18n();
  const normalizedContent = content.trim();
  const baseClassName = className.trim();
  const emptyText = emptyState ?? t('static_pages.not_set_in_admin');

  if (!normalizedContent) {
    return <div className={baseClassName}>{emptyText}</div>;
  }

  if (looksLikeHtml(normalizedContent)) {
    const htmlClassName = [baseClassName, HTML_CONTENT_CLASS_NAME].filter(Boolean).join(' ');

    return <div className={htmlClassName} dangerouslySetInnerHTML={{ __html: normalizedContent }} />;
  }

  const textClassName = [baseClassName, 'whitespace-pre-wrap'].filter(Boolean).join(' ');

  return <div className={textClassName}>{normalizedContent}</div>;
}
