/**
 * Мини-конвертер Markdown -> HTML, заточенный под описания точек Locus Map.
 * Поддерживает: **жирный**, *курсив*, _курсив_, __жирный__, [текст](url),
 * теги <emo>…</emo> (остаются как эмодзи) и переносы строк.
 * Прочий HTML экранируется — безопасно для CDATA-описаний.
 */

import { escapeHtml } from './util';

const KNOWN_INLINE_TAGS =
  /<\/?(?:b|i|u|s|sub|sup|a|img|br|font|ul|ol|li|hr|div|span|p|strong|em|table|tr|td|h1|h2|h3|h4|h5|h6)\b[^>]*>/gi;

export function markdownToHtml(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  let source = String(text).replace(/\r\n?/g, '\n');

  // <emo>…</emo> -> только эмодзи-содержимое
  source = source.replace(/<emo>([\s\S]*?)<\/emo>/gi, '$1');

  const stash: string[] = [];
  const protect = (fragment: string): string => {
    stash.push(fragment);
    return '\uE200' + (stash.length - 1) + '\uE201';
  };

  // сохраняем уже готовый HTML как есть
  source = source.replace(KNOWN_INLINE_TAGS, protect);

  // markdown-ссылки -> <a>
  source = source.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, url: string) =>
    protect(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
  );

  // остальное экранируем
  source = escapeHtml(source);

  // жирный
  source = source.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  source = source.replace(/__([^_]+)__/g, '<b>$1</b>');
  // курсив
  source = source.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  source = source.replace(/_([^_\n]+)_/g, '<i>$1</i>');

  // восстанавливаем сохранённый HTML
  source = source.replace(/\uE200(\d+)\uE201/g, (_match, index: string) => stash[Number(index)]);

  // переносы строк -> <br>
  source = source.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');

  return source;
}
