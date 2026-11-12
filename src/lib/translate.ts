/**
 * Встроенный переводчик через бесплатный эндпоинт Google Translate.
 * Строки переводятся пачками (по умолчанию 50), внутри пачки — параллельные запросы.
 */

import https from 'https';
import type { TranslateOptions } from '../types';
import { isArray } from './util';

interface TranslateEndpoint {
  url: string;
  parse: (data: unknown) => string;
}

const ENDPOINTS: TranslateEndpoint[] = [
  // Самый надёжный бесплатный эндпоинт.
  { url: 'https://translate.googleapis.com/translate_a/t', parse: parseCompactResponse },
  { url: 'https://clients5.google.com/translate_a/t', parse: parseCompactResponse },
  // Запасной "single"-эндпоинт (может отдавать 429).
  { url: 'https://translate.googleapis.com/translate_a/single', parse: parseLegacyResponse },
];

/** Формат [[["перевод","язык"], ...]] */
function parseCompactResponse(data: unknown): string {
  if (!isArray(data)) return '';
  const segments: string[] = [];
  for (const segment of data) {
    if (isArray(segment) && typeof segment[0] === 'string') segments.push(segment[0]);
  }
  return segments.join('');
}

/** Формат [[["перевод","оригинал"], ...], ...] */
function parseLegacyResponse(data: unknown): string {
  if (!isArray(data) || !isArray(data[0])) return '';
  const segments: string[] = [];
  for (const segment of data[0]) {
    if (isArray(segment) && typeof segment[0] === 'string') segments.push(segment[0]);
  }
  return segments.join('');
}

function buildRequestUrl(endpoint: TranslateEndpoint, text: string, targetLanguage: string): string {
  const encodedText = encodeURIComponent(text);
  const encodedLanguage = encodeURIComponent(targetLanguage);
  if (endpoint.url.includes('/translate_a/t')) {
    return `${endpoint.url}?client=dict-chrome-ex&sl=auto&tl=${encodedLanguage}&q=${encodedText}`;
  }
  return `${endpoint.url}?client=gtx&sl=auto&tl=${encodedLanguage}&dt=t&q=${encodedText}`;
}

/**
 * Преобразует markdown, <emo> и "голые" URL в HTML перед переводом.
 * Бесплатный эндпоинт Google надёжно сохраняет HTML-теги (<b>, <i>, <a href>, <br>),
 * поэтому разметка не портится. Текст здесь НЕ экранируется — он идёт переводчику.
 */
export function markdownToHtmlRaw(text: string): string {
  let source = String(text).replace(/\r\n?/g, '\n');
  source = source.replace(/<emo>([\s\S]*?)<\/emo>/gi, '$1');
  source = source.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  source = source.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  source = source.replace(/__([^_]+)__/g, '<b>$1</b>');
  source = source.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  source = source.replace(/_([^_\n]+)_/g, '<i>$1</i>');
  source = source.replace(/(?<!href=["'])(https?:\/\/[^\s<>()[\]"']+)/gi, '<a href="$1">$1</a>');
  source = source.replace(/\n/g, '<br>');
  return source;
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: '*/*',
        },
        timeout: 25000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error('HTTP ' + response.statusCode));
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve(body));
      }
    );
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}


/** Переводит одну строку; при сбоях пробует несколько эндпоинтов и повторов. */
export async function translateOne(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text;
  const guarded = markdownToHtmlRaw(text);

  let lastError: Error = new Error('translation failed');
  for (const endpoint of ENDPOINTS) {
    const url = buildRequestUrl(endpoint, guarded, targetLanguage);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body = await httpGet(url);
        const data: unknown = JSON.parse(body);
        const translated = endpoint.parse(data);
        if (!translated) {
          lastError = new Error('empty translation');
          break;
        }
        return translated;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Переводит массив строк пачками по `batchSize` (по умолчанию 50).
 * Внутри пачки выполняется до `concurrency` параллельных запросов.
 */
export async function translateStrings(
  strings: string[],
  targetLanguage: string,
  options: TranslateOptions = {}
): Promise<string[]> {
  const batchSize = options.batchSize ?? 50;
  const concurrency = options.concurrency ?? 8;
  const onProgress = options.onProgress ?? ((): void => {});
  const onBatch = options.onBatch ?? ((): void => {});

  const total = strings.length;
  const results: string[] = new Array(total);
  let completed = 0;

  const runWorker = async (queue: number[]): Promise<void> => {
    while (queue.length > 0) {
      const index = queue.shift();
      if (index === undefined) break;
      try {
        results[index] = await translateOne(strings[index], targetLanguage);
      } catch (error) {
        // при ошибке оставляем оригинал; прогресс сохранится и можно продолжить позже
        results[index] = strings[index];
        options.onError?.(strings[index], error instanceof Error ? error : new Error(String(error)));
      }
      completed += 1;
      onProgress(completed, total);
    }
  };

  for (let start = 0; start < total; start += batchSize) {
    const end = Math.min(start + batchSize, total);
    const indexes: number[] = [];
    for (let i = start; i < end; i++) indexes.push(i);

    const workers = Math.min(concurrency, indexes.length);
    await Promise.all(Array.from({ length: workers }, () => runWorker(indexes)));
    onBatch(end, total);
  }

  return results;
}
