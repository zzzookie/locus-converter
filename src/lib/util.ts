/**
 * Общие утилиты: экранирование, работа с путями полей, интерполяция.
 */

import type { Point } from '../types';

/** Экранирует строку для безопасной вставки в HTML. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Экранирует строку для вставки в XML (теги и атрибуты). */
export function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Оборачивает текст в CDATA, корректно разрывая литерал "]]>",
 * чтобы он преждевременно не завершил секцию.
 */
export function cdata(text: string): string {
  return '<![CDATA[' + text.replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
}

/** Type-guard для массивов без утечки `any` из `Array.isArray`. */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Type-guard для обычных объектов (не null, не массив). */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Является ли значение корректной координатой (число или числовая строка). */
export function isCoordinate(value: unknown): boolean {
  return (typeof value === 'string' || typeof value === 'number') && !Number.isNaN(Number(value));
}

/**
 * Разрешает путь вида "a.b.c" или "a[0].b" внутри произвольной структуры.
 * Возвращает `unknown`: вызывающий код сам сужает тип.
 */
export function resolvePath(target: unknown, path: string | null | undefined): unknown {
  if (target === null || target === undefined || !path) return undefined;
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = target;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

/**
 * Устанавливает значение по пути, создавая промежуточные объекты/массивы.
 * Используется только для простых объектных путей (без индексов массивов).
 */
export function setByPath(target: Point, path: string, value: unknown): void {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  if (segments.length === 0) return;

  let currentNode: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    if (isArray(currentNode)) {
      const index = Number(segment);
      if (currentNode[index] === null || currentNode[index] === undefined) {
        currentNode[index] = /^\d+$/.test(nextSegment) ? [] : {};
      }
      currentNode = currentNode[index] as Record<string, unknown> | unknown[];
      continue;
    }
    const objectNode = currentNode as Record<string, unknown>;
    if (objectNode[segment] === null || objectNode[segment] === undefined) {
      objectNode[segment] = /^\d+$/.test(nextSegment) ? [] : {};
    }
    currentNode = objectNode[segment] as Record<string, unknown> | unknown[];
  }

  const lastSegment = segments[segments.length - 1];
  if (isArray(currentNode)) currentNode[Number(lastSegment)] = value;
  else (currentNode as Record<string, unknown>)[lastSegment] = value;
}

/** Разметка плейсхолдера: имя поля + маркеры начертания. */
export interface PlaceholderFormatting {
  name: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Разбирает содержимое `{{ … }}` на имя поля и маркеры начертания:
 * `{{*поле*}}` — курсив, `{{**поле**}}` — жирный, `{{***поле***}}` — оба.
 */
export function parsePlaceholderName(raw: string): PlaceholderFormatting {
  const trimmed = String(raw ?? '').trim();
  const match = /^(\*{1,3})([\s\S]+?)\1$/.exec(trimmed);
  if (match === null) return { name: trimmed, bold: false, italic: false };
  const markers = match[1].length;
  return {
    name: match[2].trim(),
    bold: markers === 2 || markers === 3,
    italic: markers === 1 || markers === 3,
  };
}

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export interface InterpolateOptions {
  /** Оборачивать значения тегами `<b>`/`<i>` по маркерам (только для HTML-описаний). */
  format?: boolean;
}

/** Заменяет токены "{{ поле }}" в строке значениями из точки. */
export function interpolate(template: string, point: Point, options: InterpolateOptions = {}): string {
  return String(template ?? '').replace(PLACEHOLDER_RE, (_match, raw: string) => {
    const { name, bold, italic } = parsePlaceholderName(raw);
    let text = formatValueInline(resolvePath(point, name));
    if (options.format === true && text !== '') {
      if (bold) text = `<b>${text}</b>`;
      if (italic) text = `<i>${text}</i>`;
    }
    return text;
  });
}

/** Преобразует значение в строку для подстановки внутрь текста. */
export function formatValueInline(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) return JSON.stringify(item);
        return String(item);
      })
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
