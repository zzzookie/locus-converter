/**
 * Рендеринг точки по шаблону: название и HTML-описание.
 */

import { escapeHtml, escapeXml, formatValueInline, interpolate, isArray, isObject, parsePlaceholderName, resolvePath } from './util';
import { markdownToHtml } from './markdown';
import { isPathPresent } from './json-util';
import type { FieldSchema, FieldWrap, NameConfig, Point, Template, TemplateBlock, TranslateTarget } from '../types';

let uidCounter = 0;

function uid(): string {
  return 'b' + Date.now().toString(36) + '_' + (uidCounter++).toString(36);
}

/**
 * Выводит пару «обёртка + разметка» из блока, понимая устаревший `format`.
 * Те же правила продублированы в web/src/template.ts (getBlockFormatting) —
 * клиент не может импортировать серверный рантайм, меняйте обе реализации вместе.
 */
function blockFormatting(block: TemplateBlock): { wrap: FieldWrap; markup: boolean } {
  if (block.wrap !== undefined || block.markup !== undefined) {
    return { wrap: block.wrap ?? 'none', markup: block.markup ?? true };
  }
  switch (block.format) {
    case 'plain':
      return { wrap: 'none', markup: false };
    case 'heading':
    case 'bold':
    case 'italic':
      return { wrap: block.format, markup: true };
    case 'markdown':
    default:
      return { wrap: 'none', markup: true };
  }
}

/** Превращает текст в HTML: с разметкой (Markdown/HTML) или «как есть». */
function renderText(text: string, markup: boolean): string {
  if (markup) return markdownToHtml(text);
  return escapeHtml(text).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}

/**
 * Текст блока «Текст»: подставляет `{{поле}}` (учитывая начертание) и
 * применяет режим разметки. В режиме «как есть» экранируется и текст шаблона,
 * и значения — кроме тегов `<b>`/`<i>`, которые генерируются для начертания.
 */
const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function renderTemplateText(template: string, point: Point, markup: boolean): string {
  if (markup) return markdownToHtml(interpolate(template, point, { format: true }));

  let result = '';
  let index = 0;
  TEMPLATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_RE.exec(template)) !== null) {
    result += escapeHtml(template.slice(index, match.index));

    const { name, bold, italic } = parsePlaceholderName(match[1]);
    let value = formatValueInline(resolvePath(point, name));
    if (value !== '') {
      value = escapeHtml(value);
      if (bold) value = `<b>${value}</b>`;
      if (italic) value = `<i>${value}</i>`;
    }
    result += value;
    index = match.index + match[0].length;
  }

  result += escapeHtml(template.slice(index));
  return result.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}

/** Заполняет значения шаблона по умолчанию. */
export function normalizeTemplate(input: Partial<Template> | null | undefined): Template {
  const source = input ?? {};
  const name: NameConfig = { field: 'name', template: '{{name}}', translate: true, ...(source.name ?? {}) };
  const blocks: TemplateBlock[] = Array.isArray(source.blocks)
    ? source.blocks.map((block) => ({ ...block, ...blockFormatting(block), id: block.id ?? uid() }))
    : [];

  return {
    name,
    latField: source.latField ?? 'lat',
    lonField: source.lonField ?? 'lon',
    urlField: source.urlField ?? '',
    urlNameField: source.urlNameField ?? '',
    iconField: source.iconField ?? '',
    targetLanguage: source.targetLanguage ?? 'ru',
    blocks,
  };
}

/** Поля, из которых берётся ссылка точки (`<url>` в GPX). */
const URL_FIELD_CANDIDATES = ['url', 'link', 'website', 'atlas_url', 'source_url', 'permalink'];
/** Поля, из которых берётся название ссылки (`<urlname>` в GPX). */
const URL_NAME_CANDIDATES = ['urlname', 'url_name', 'link_name', 'title'];

/** Первое существующее строковое поле из списка кандидатов. */
function firstStringPath(schema: FieldSchema[], candidates: string[]): string {
  for (const candidate of candidates) {
    const found = schema.find((field) => field.path === candidate && field.type === 'string');
    if (found) return found.path;
  }
  return '';
}

/** Ищет поле-ссылку: сначала по именам, затем строковый путь, кончающийся на `url`. */
function detectUrlField(schema: FieldSchema[]): string {
  const direct = firstStringPath(schema, URL_FIELD_CANDIDATES);
  if (direct) return direct;

  // Вложенные пути внутри массивов (например `sources.url`) не годятся для <url>:
  // в точке это массив объектов. Такие ссылки берутся из блока «Ссылки».
  const nested = schema.find((field) => {
    if (field.type !== 'string' || !/(^|\.)url$/i.test(field.path)) return false;
    const separator = field.path.lastIndexOf('.');
    if (separator < 0) return true;
    const parent = schema.find((item) => item.path === field.path.slice(0, separator));
    return parent === undefined || parent.type !== 'array';
  });
  return nested ? nested.path : '';
}

/** Строит разумный шаблон по умолчанию из обнаруженной схемы. */
export function defaultTemplate(schema: FieldSchema[], latField: string | null, lonField: string | null): Template {
  const hasField = (path: string): boolean => schema.some((field) => field.path === path);
  const blocks: TemplateBlock[] = [];
  const add = (block: Omit<TemplateBlock, 'id'>): void => {
    blocks.push({ id: uid(), ...block });
  };

  if (hasField('image_url')) add({ kind: 'image', field: 'image_url' });
  if (hasField('name')) add({ kind: 'field', field: 'name', wrap: 'heading', markup: true, translate: true });
  if (hasField('description')) add({ kind: 'field', field: 'description', wrap: 'none', markup: true, translate: true });
  if (hasField('one_liner_desc')) add({ kind: 'field', field: 'one_liner_desc', wrap: 'none', markup: true, translate: true });
  if (hasField('snap_facts')) add({ kind: 'list', field: 'snap_facts', translate: true });
  if (hasField('wow_bit')) add({ kind: 'field', field: 'wow_bit', wrap: 'none', markup: true, translate: true });
  if (hasField('why_it_matters')) add({ kind: 'field', field: 'why_it_matters', wrap: 'none', markup: true, translate: true });
  if (hasField('sources')) add({ kind: 'links', field: 'sources', nameField: 'name', urlField: 'url', translate: true });
  if (hasField('category')) add({ kind: 'literal', text: 'Категории: {{category}}' });
  add({ kind: 'separator' });

  return normalizeTemplate({
    name: { field: hasField('name') ? 'name' : '', template: hasField('name') ? '{{name}}' : '', translate: true },
    latField: latField ?? 'lat',
    lonField: lonField ?? 'lon',
    urlField: detectUrlField(schema),
    urlNameField: firstStringPath(schema, URL_NAME_CANDIDATES),
    targetLanguage: 'ru',
    blocks,
  });
}

/** Список целей перевода, развёрнутый из блоков шаблона. */
export function getTranslateTargets(template: Template): TranslateTarget[] {
  const targets: TranslateTarget[] = [];
  if (template.name.translate && template.name.field) {
    targets.push({ field: template.name.field, subfield: '', translate: true });
  }
  for (const block of template.blocks) {
    if (block.translate && block.field) {
      targets.push({ field: block.field, subfield: block.subfield ?? '', translate: true });
    }
  }
  return targets;
}

/** Рендерит название точки из шаблона. */
export function renderName(point: Point, template: Template): string {
  const source = template.name.template || (template.name.field ? `{{${template.name.field}}}` : '');
  return interpolate(source, point);
}

/**
 * Ссылка точки для `<url>`/`<urlname>` в GPX: явные поля шаблона
 * (`urlField`/`urlNameField`) или первый URL из блока «Ссылки».
 * Если название не задано — используется название точки.
 */
export function pickPointUrl(point: Point, template: Template): { url: string; urlName: string } | null {
  const explicit = template.urlField ? resolvePath(point, template.urlField) : undefined;
  let url = typeof explicit === 'string' ? explicit.trim() : typeof explicit === 'number' ? String(explicit) : '';

  let urlName = '';
  const explicitName = template.urlNameField ? resolvePath(point, template.urlNameField) : undefined;
  if (typeof explicitName === 'string') urlName = explicitName.trim();

  if (url === '') {
    for (const block of template.blocks) {
      if (block.kind !== 'links' || !block.field) continue;
      const value = resolvePath(point, block.field);
      const items: unknown[] = isArray(value) ? value : value === null || value === undefined ? [] : [value];
      for (const item of items) {
        if (!isObject(item)) continue;
        const candidate = item[block.urlField ?? 'url'];
        if (typeof candidate !== 'string' || candidate.trim() === '') continue;
        url = candidate.trim();
        if (urlName === '') {
          const candidateName = item[block.nameField ?? 'name'];
          if (typeof candidateName === 'string') urlName = candidateName.trim();
        }
        break;
      }
      if (url !== '') break;
    }
  }

  if (url === '') return null;
  return { url, urlName: urlName || renderName(point, template) };
}

/**
 * Применяет обёртку к значению поля. Разметка управляется отдельно (`markup`):
 * так достижимы все комбинации, включая «жирный без разметки».
 */
export function formatFieldValue(value: unknown, wrap: FieldWrap = 'none', markup = true): string {
  if (value === null || value === undefined) return '';
  const html = renderText(String(value), markup);
  switch (wrap) {
    case 'heading':
      return `<font size="4"><b>${html}</b></font>`;
    case 'bold':
      return `<b>${html}</b>`;
    case 'italic':
      return `<i>${html}</i>`;
    case 'none':
    default:
      return html;
  }
}


/** Рендерит один блок описания. */
function renderBlock(point: Point, block: TemplateBlock): string {
  switch (block.kind) {
    case 'image': {
      const source = resolvePath(point, block.field);
      if (typeof source !== 'string' || source === '') return '';
      const caption = block.label ? `<br><i>${escapeHtml(block.label)}</i>` : '';
      return `<img src="${escapeXml(source)}" style="width:100%;max-width:100%;border-radius:8px;" alt="" />${caption}`;
    }

    case 'separator':
      if (block.conditionFields && block.conditionFields.length > 0) {
        const anyPresent = block.conditionFields.some((field) => isPathPresent(point, field));
        if (!anyPresent) return '';
      }
      return '<hr />';

    case 'literal': {
      const { markup } = blockFormatting(block);
      return renderTemplateText(block.text ?? '', point, markup);
    }

    case 'links': {
      const value = resolvePath(point, block.field);
      if (value === null || value === undefined) return '';
      const items: unknown[] = isArray(value) ? value : [value];
      const nameField = block.nameField ?? 'name';
      const urlField = block.urlField ?? 'url';

      const links: string[] = [];
      for (const item of items) {
        if (!isObject(item)) continue;
        const url = item[urlField];
        const name = item[nameField] ?? url;
        if (typeof url === 'string') {
          links.push(
            `<a href="${escapeXml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(name))}</a>`
          );
        } else if (name !== null && name !== undefined) {
          links.push(escapeHtml(String(name)));
        }
      }
      if (links.length === 0) return '';
      const label = block.label ? `<b>${escapeHtml(block.label)}</b><br>` : '';
      return label + links.join('<br>');
    }

    case 'list': {
      const value = resolvePath(point, block.field);
      if (value === null || value === undefined) return '';
      const items: unknown[] = isArray(value) ? value : [value];

      const rendered = items
        .map((item): string | null => {
          let text: unknown = item;
          if (isObject(item) && block.subfield) text = item[block.subfield];
          if (text === null || text === undefined) return null;
          const raw = String(text);
          if (block.itemFormat === 'bold') return `<li><b>${escapeHtml(raw)}</b></li>`;
          if (block.itemFormat === 'markdown') return `<li>${markdownToHtml(raw)}</li>`;
          return `<li>${escapeHtml(raw)}</li>`;
        })
        .filter((item): item is string => item !== null);

      if (rendered.length === 0) return '';
      const label = block.label ? `<b>${escapeHtml(block.label)}</b><br>` : '';
      return `${label}<ul>${rendered.join('')}</ul>`;
    }

    case 'field':
    default: {
      const value = resolvePath(point, block.field);
      if (value === null || value === undefined || value === '') return '';
      const label = block.label ? `<b>${escapeHtml(block.label)}</b> ` : '';
      const { wrap, markup } = blockFormatting(block);
      return label + formatFieldValue(value, wrap, markup);
    }
  }
}

/** Рендерит полное HTML-описание точки из всех блоков. */
export function renderDescription(point: Point, template: Template): string {
  const parts: string[] = [];
  for (const block of template.blocks) {
    const html = renderBlock(point, block);
    if (html) parts.push(html);
  }
  return parts.join('<br>');
}
