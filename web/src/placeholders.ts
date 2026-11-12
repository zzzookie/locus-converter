/**
 * Разбор плейсхолдеров вида `{{поле}}` в текстовых шаблонах
 * (название точки, блок «Текст»): чипы, автодополнение и начертание.
 *
 * Начертание задаётся маркерами внутри скобок:
 * `{{*поле*}}` — курсив, `{{**поле**}}` — жирный, `{{***поле***}}` — оба.
 */

import type { FieldSchema } from '@core';

/** Найденный в тексте плейсхолдер. */
export interface PlaceholderToken {
  /** Как записано в тексте, например `{{**category**}}`. */
  raw: string;
  /** Имя поля без скобок, пробелов и маркеров. */
  name: string;
  /** Жирное начертание. */
  bold: boolean;
  /** Курсив. */
  italic: boolean;
  /** Индекс первого `{`. */
  start: number;
  /** Индекс сразу за закрывающими `}}` (или длина строки для незакрытого). */
  end: number;
  /** Есть ли закрывающие скобки. */
  closed: boolean;
}

/** Маркеры начертания для записи внутри `{{ … }}`. */
export function formattingMarkers(bold: boolean, italic: boolean): string {
  if (bold && italic) return '***';
  if (bold) return '**';
  if (italic) return '*';
  return '';
}

/** Канонический вид плейсхолдера по имени и начертанию. */
export function placeholderRaw(name: string, bold: boolean, italic: boolean): string {
  const markers = formattingMarkers(bold, italic);
  return `{{${markers}${name}${markers}}}`;
}

/** Разбирает содержимое `{{ … }}` на имя поля и начертание. */
function splitFormatting(raw: string): { name: string; bold: boolean; italic: boolean } {
  const trimmed = raw.trim();
  const match = /^(\*{1,3})([\s\S]+?)\1$/.exec(trimmed);
  if (match === null) return { name: trimmed, bold: false, italic: false };
  const markers = match[1].length;
  return {
    name: match[2].trim(),
    bold: markers === 2 || markers === 3,
    italic: markers === 1 || markers === 3,
  };
}

const PLACEHOLDER_RE = /\{\{([^{}]*)\}\}/g;

/** Находит все `{{поле}}`, включая незакрытый хвост вида `{{categ`. */
export function parsePlaceholders(value: string): PlaceholderToken[] {
  const tokens: PlaceholderToken[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_RE.exec(value)) !== null) {
    const { name, bold, italic } = splitFormatting(match[1]);
    tokens.push({
      raw: placeholderRaw(name, bold, italic),
      name,
      bold,
      italic,
      start: match.index,
      end: match.index + match[0].length,
      closed: true,
    });
  }

  const lastClosedEnd = tokens.length > 0 ? tokens[tokens.length - 1].end : 0;
  const tail = value.slice(lastClosedEnd);
  const openIndex = tail.lastIndexOf('{{');
  if (openIndex >= 0 && !tail.slice(openIndex).includes('}}')) {
    tokens.push({
      raw: tail.slice(openIndex),
      name: tail.slice(openIndex + 2),
      bold: false,
      italic: false,
      start: lastClosedEnd + openIndex,
      end: value.length,
      closed: false,
    });
  }
  return tokens;
}

/** Уникальные плейсхолдеры в порядке появления (незакрытый считается отдельно). */
export function uniquePlaceholders(tokens: PlaceholderToken[]): PlaceholderToken[] {
  const seen = new Set<string>();
  const result: PlaceholderToken[] = [];
  for (const token of tokens) {
    const key = `${token.closed ? 'c' : 'o'}:${token.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}

/** Есть ли такое поле в схеме JSON. */
export function isKnownField(schema: FieldSchema[], name: string): boolean {
  if (!name) return false;
  return schema.some((field) => field.path === name);
}

/** Приводит `{{ имя }}` к каноническому виду `{{имя}}`, сохраняя маркеры начертания. */
export function normalizePlaceholders(value: string): string {
  return value.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_match, raw: string) => {
    const { name, bold, italic } = splitFormatting(raw);
    return placeholderRaw(name, bold, italic);
  });
}

/** Плейсхолдер, который пользователь набирает прямо сейчас. */
export interface ActiveToken {
  /** Индекс `{{`, с которого начинается набираемый плейсхолдер. */
  start: number;
  /** Индекс, до которого нужно заменить текст (учитывает уже закрытый `}}`). */
  end: number;
  /** Уже введённая часть имени поля (без маркеров начертания). */
  query: string;
  /** Маркеры начертания, если набор начат с `*`. */
  markers: string;
}

/** Находит набираемый плейсхолдер по позиции курсора. */
export function findActiveToken(value: string, caret: number): ActiveToken | null {
  const position = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, position);
  const open = before.lastIndexOf('{{');
  if (open < 0) return null;

  const between = before.slice(open + 2);
  if (between.includes('}')) return null;

  // Курсор может стоять внутри уже закрытого плейсхолдера — заменяем его целиком.
  const after = value.slice(position);
  const closeIndex = after.indexOf('}}');
  const nextOpenIndex = after.indexOf('{{');
  const closedHere = closeIndex >= 0 && (nextOpenIndex < 0 || closeIndex < nextOpenIndex);
  const end = closedHere ? position + closeIndex + 2 : position;

  const markers = /^\*{1,3}/.exec(between)?.[0] ?? '';
  return { start: open, end, query: between.slice(markers.length), markers };
}

/** Подставляет выбранное поле вместо набираемого плейсхолдера (с учётом набранных `*`). */
export function applySuggestion(
  value: string,
  token: ActiveToken,
  name: string
): { value: string; caret: number } {
  const markers = token.markers;
  const inserted = `{{${markers}${name}${markers}}}`;
  return {
    value: value.slice(0, token.start) + inserted + value.slice(token.end),
    caret: token.start + inserted.length,
  };
}

/** Меняет начертание у закрытого плейсхолдера с указанным индексом. */
export function applyFormatting(
  value: string,
  index: number,
  next: { bold: boolean; italic: boolean }
): { value: string; caret: number } {
  const token = parsePlaceholders(value).filter((item) => item.closed)[index];
  if (token === undefined) return { value, caret: 0 };

  const inserted = placeholderRaw(token.name, next.bold, next.italic);
  return {
    value: value.slice(0, token.start) + inserted + value.slice(token.end),
    caret: token.start + inserted.length,
  };
}

