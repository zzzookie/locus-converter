/**
 * Типы шаблона конвертации и генерации GPX/KML.
 */

import type { Point } from './json';

/** Виды блоков описания, которые пользователь добавляет в шаблон. */
export type BlockKind = 'field' | 'image' | 'list' | 'links' | 'separator' | 'literal';

/** Обёртка вокруг значения поля (применяется поверх разметки). */
export type FieldWrap = 'none' | 'heading' | 'bold' | 'italic';

/**
 * Устаревший единый формат поля: `markdown` = без обёртки + разметка,
 * `plain` = без обёртки без разметки. Оставлен для чтения старых шаблонов
 * и сессий — при загрузке нормализуется в `wrap` + `markup`.
 */
export type FieldFormat = 'markdown' | 'heading' | 'bold' | 'italic' | 'plain';

/** Форматирование элементов внутри блока-списка. */
export type ListItemFormat = 'plain' | 'bold' | 'markdown';

/** Настройки названия точки. */
export interface NameConfig {
  field: string;
  template: string;
  translate: boolean;
}

/** Один блок описания точки. */
export interface TemplateBlock {
  id: string;
  kind: BlockKind;
  field?: string;
  subfield?: string;
  format?: FieldFormat;
  /** Обёртка значения: без обёртки / заголовок / жирный / курсив. */
  wrap?: FieldWrap;
  /** true — интерпретировать Markdown/HTML, false — выводить текст как есть. */
  markup?: boolean;
  itemFormat?: ListItemFormat;
  label?: string;
  translate?: boolean;
  text?: string;
  nameField?: string;
  urlField?: string;
  conditionFields?: string[];
}

/** Полный шаблон конвертации. */
export interface Template {
  name: NameConfig;
  latField: string;
  lonField: string;
  urlField: string;
  urlNameField: string;
  iconField: string;
  targetLanguage: string;
  blocks: TemplateBlock[];
}

/** Конкретное поле для перевода (развёрнуто из блоков шаблона). */
export interface TranslateTarget {
  field: string;
  subfield: string;
  translate: boolean;
}

/** Аргументы генератора GPX. */
export interface GpxBuildOptions {
  points: Point[];
  template: Template;
  metaName?: string;
  metaDesc?: string;
  creator?: string;
}

/** Аргументы генератора KML. */
export interface KmlBuildOptions {
  points: Point[];
  template: Template;
  metaName?: string;
  metaDesc?: string;
}
