import type { BlockKind, FieldWrap, ListItemFormat } from '@core';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export const LANGUAGE_OPTIONS: SelectOption<string>[] = [
  { value: 'ru', label: 'Русский (ru)' },
  { value: 'en', label: 'English (en)' },
  { value: 'es', label: 'Español (es)' },
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'fr', label: 'Français (fr)' },
  { value: 'it', label: 'Italiano (it)' },
  { value: 'pt', label: 'Português (pt)' },
  { value: 'uk', label: 'Українська (uk)' },
  { value: 'pl', label: 'Polski (pl)' },
  { value: 'tr', label: 'Türkçe (tr)' },
  { value: 'ar', label: 'العربية (ar)' },
  { value: 'he', label: 'עברית (he)' },
  { value: 'zh-CN', label: '中文 (zh-CN)' },
  { value: 'ja', label: '日本語 (ja)' },
  { value: 'ko', label: '한국어 (ko)' },
];

export const BLOCK_KIND_OPTIONS: { value: BlockKind; label: string }[] = [
  { value: 'field', label: 'Поле' },
  { value: 'image', label: 'Картинка' },
  { value: 'list', label: 'Список' },
  { value: 'links', label: 'Ссылки' },
  { value: 'literal', label: 'Текст' },
  { value: 'separator', label: 'Разделитель' },
];

/**
 * Варианты обёртки значения поля. Разметка Markdown/HTML — отдельный
 * переключатель в карточке блока, поэтому «обычный» здесь не нужен.
 */
export const FIELD_WRAP_OPTIONS: SelectOption<FieldWrap>[] = [
  { value: 'none', label: 'обычный' },
  { value: 'heading', label: 'заголовок' },
  { value: 'bold', label: 'жирный' },
  { value: 'italic', label: 'курсив' },
];

export const LIST_ITEM_FORMAT_OPTIONS: SelectOption<ListItemFormat>[] = [
  { value: 'plain', label: 'как есть' },
  { value: 'bold', label: 'жирный' },
  { value: 'markdown', label: 'с разметкой' },
];

export const EXPORT_FORMATS = ['gpx', 'kml'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
