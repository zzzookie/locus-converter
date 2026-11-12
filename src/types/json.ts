/**
 * Типы, описывающие произвольный JSON и его разбор в точки.
 */

/** Примитивные значения JSON. */
export type JsonPrimitive = string | number | boolean | null;

/** Любое значение JSON. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** Объект JSON (словарь с строковыми ключами). */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** Массив JSON. */
export type JsonArray = JsonValue[];

/** Одна точка (waypoint), извлечённая из входного JSON. */
export type Point = JsonObject;

/** Результат поиска массива точек внутри произвольного JSON. */
export interface DetectedPoints {
  /** Объекты точек. */
  points: Point[];
  /** Имя поля-обёртки или null, если вход сам является массивом. */
  listField: string | null;
}

/** Метка типа поля, отображаемая в интерфейсе. */
export type JsonFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

/** Одно уплощённое поле первой точки (для UI выбора полей). */
export interface FieldSchema {
  path: string;
  type: JsonFieldType;
  sample: string;
  itemType?: JsonFieldType;
  subfields?: string[];
  nullCount?: number;
  presentCount?: number;
}

/** Автоматически определённые имена полей координат. */
export interface LatLonDetection {
  lat: string | null;
  lon: string | null;
}
