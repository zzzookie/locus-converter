/**
 * Разбор произвольного JSON в список точек, определение схемы полей
 * и сбор/применение перевода по целям.
 */

import { isArray, isObject, resolvePath, setByPath } from './util';
import type {
  DetectedPoints,
  FieldSchema,
  JsonFieldType,
  JsonValue,
  LatLonDetection,
  Point,
  TranslateTarget,
} from '../types';

/** Разбирает JSON-текст; при ошибке бросает понятное исключение. */
export function parseJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error('Некорректный JSON: ' + message);
  }
}

/**
 * Находит массив точек внутри произвольного JSON.
 *  - массив объектов        -> points = массив, listField = null
 *  - объект с массивом      -> points = этот массив, listField = имя поля
 *  - одиночный объект       -> points = [объект], listField = null
 */
export function detectPoints(data: JsonValue): DetectedPoints {
  if (isArray(data)) {
    if (data.length > 0 && !data.every(isObject)) {
      throw new Error('Массив должен содержать объекты (точки), а не примитивы.');
    }
    return { points: data as Point[], listField: null };
  }
  if (isObject(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (isArray(value) && value.length > 0 && value.every(isObject)) {
        return { points: value as Point[], listField: key };
      }
    }
    return { points: [data], listField: null };
  }
  throw new Error('JSON должен быть массивом точек или объектом, содержащим массив точек.');
}

/** Автоматически определяет имена полей широты и долготы. */
export function detectLatLon(point: Point): LatLonDetection {
  let lat: string | null = null;
  let lon: string | null = null;
  for (const key of Object.keys(point)) {
    const normalized = key.toLowerCase();
    if (lat === null && (normalized === 'lat' || normalized === 'latitude')) lat = key;
    if (lon === null && (normalized === 'lon' || normalized === 'lng' || normalized === 'long' || normalized === 'longitude')) {
      lon = key;
    }
  }
  return { lat, lon };
}

/** Возвращает метку типа значения для схемы полей. */
export function typeOf(value: JsonValue): JsonFieldType {
  if (value === null) return 'null';
  if (isArray(value)) return 'array';
  return typeof value as JsonFieldType;
}

/** Возвращает короткий образец значения для отображения в интерфейсе. */
export function sampleOf(value: JsonValue): string {
  if (value === null) return 'null';
  if (isArray(value)) return value.length > 0 ? sampleOf(value[0]) : '[]';
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 80 ? json.slice(0, 80) + '…' : json;
    } catch {
      return '{…}';
    }
  }
  const text = String(value);
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}


/** Уплощает первую точку в дерево полей для UI. */
export function flattenSchema(point: Point, maxDepth = 5): FieldSchema[] {
  const fields: FieldSchema[] = [];

  const walk = (node: Record<string, JsonValue>, prefix: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const type = typeOf(value);
      const field: FieldSchema = { path, type, sample: sampleOf(value) };

      let arrayItem: JsonValue | undefined;
      if (type === 'array' && isArray(value) && value.length > 0) {
        arrayItem = value[0];
        field.itemType = typeOf(arrayItem);
        if (field.itemType === 'object' && isObject(arrayItem)) {
          field.subfields = Object.keys(arrayItem);
        }
      }

      fields.push(field);

      if (type === 'object' && isObject(value) && depth < maxDepth) {
        walk(value, path, depth + 1);
      } else if (field.itemType === 'object' && isObject(arrayItem) && depth < maxDepth) {
        walk(arrayItem, path, depth + 1);
      }
    }
  };

  walk(point, '', 0);
  return fields;
}

/** Считается ли значение «заполненным» (не null/undefined и не пустое). */
function isValuePresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Собирает все листовые значения по пути, «разворачивая» массивы по дороге. */
function collectLeafValues(target: unknown, segments: string[]): unknown[] {
  if (segments.length === 0) {
    return Array.isArray(target) ? [...target] : [target];
  }
  if (target === null || target === undefined) return [];
  if (Array.isArray(target)) return target.flatMap((item) => collectLeafValues(item, segments));
  if (typeof target !== 'object') return [];
  const [head, ...rest] = segments;
  return collectLeafValues((target as Record<string, unknown>)[head], rest);
}

/** Заполнено ли поле хотя бы одним значением в конкретной точке. */
export function isPathPresent(point: Point, path: string): boolean {
  const segments = path.split('.').filter(Boolean);
  return collectLeafValues(point, segments).some(isValuePresent);
}

/**
 * Схема полей сразу по всем точкам с подсчётом null/undefined:
 * для каждого поля считаем, в скольких точках оно заполнено, а в скольких — нет.
 */
export function analyzeSchema(points: Point[]): FieldSchema[] {
  const byPath = new Map<string, FieldSchema>();

  for (const point of points) {
    for (const field of flattenSchema(point)) {
      const existing = byPath.get(field.path);
      if (!existing) {
        byPath.set(field.path, { ...field });
        continue;
      }
      // предпочитаем не-null тип/пример
      if ((existing.type === 'null' || existing.sample === 'null') && field.type !== 'null') {
        existing.type = field.type;
        existing.sample = field.sample;
        existing.itemType = field.itemType;
      }
      if (field.subfields) {
        existing.subfields = Array.from(new Set([...(existing.subfields ?? []), ...field.subfields]));
      }
    }
  }

  const total = points.length;
  const fields = Array.from(byPath.values());
  for (const field of fields) {
    let present = 0;
    for (const point of points) {
      if (isPathPresent(point, field.path)) present += 1;
    }
    field.presentCount = present;
    field.nullCount = total - present;
  }
  return fields;
}

/** Собирает строки, которые ссылается цель перевода, для одной точки. */
export function collectBlockStrings(point: Point, target: TranslateTarget): string[] {
  if (!target.translate || !target.field) return [];
  const value = resolvePath(point, target.field);
  if (value === null || value === undefined) return [];

  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (isArray(value)) {
    if (target.subfield) {
      const strings: string[] = [];
      for (const item of value) {
        if (isObject(item)) {
          const subValue = item[target.subfield];
          if (typeof subValue === 'string' && subValue.trim()) strings.push(subValue);
        }
      }
      return strings;
    }
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  }
  return [];
}

/** Применяет переведённые строки обратно в те же поля точки. */
export function applyBlockTranslation(point: Point, target: TranslateTarget, translated: Record<string, string>): void {
  if (!target.translate || !target.field) return;
  const value = resolvePath(point, target.field);

  if (typeof value === 'string') {
    const replacement = translated[value];
    if (replacement !== undefined) setByPath(point, target.field, replacement);
    return;
  }

  if (isArray(value)) {
    if (target.subfield) {
      for (const item of value) {
        if (isObject(item)) {
          const subValue = item[target.subfield];
          if (typeof subValue === 'string') {
            const replacement = translated[subValue];
            if (replacement !== undefined) item[target.subfield] = replacement;
          }
        }
      }
    } else {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          const replacement = translated[item];
          if (replacement !== undefined) value[i] = replacement;
        }
      }
    }
  }
}

/** Восстанавливает исходный документ, но с переведёнными полями (та же структура). */
export function buildTranslatedDocument(original: JsonValue, points: Point[], listField: string | null): JsonValue {
  if (isArray(original)) return points;
  if (listField !== null && isObject(original)) {
    const clone = JSON.parse(JSON.stringify(original)) as Record<string, JsonValue>;
    clone[listField] = points;
    return clone;
  }
  return points[0] ?? {};
}
