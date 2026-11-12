import type { BlockKind, FieldSchema, FieldWrap, Template, TemplateBlock } from '@core';

let uidCounter = 0;

/** Генерирует уникальный идентификатор блока. */
export function uid(): string {
  return 'b' + Date.now().toString(36) + '_' + (uidCounter++).toString(36);
}

export interface FieldOption {
  value: string;
  label: string;
  used: boolean;
}

/**
 * Превращает схему полей в список опций для выпадающих списков.
 * Поля, уже занятые другими блоками, помечаются `used` и уходят в конец списка.
 */
export function buildFieldOptions(
  schema: FieldSchema[],
  usedFields: ReadonlySet<string> = new Set<string>(),
  currentField = ''
): FieldOption[] {
  const options: FieldOption[] = schema.map((field) => {
    const itemType = field.itemType ? '/' + field.itemType : '';
    return {
      value: field.path,
      label: `${field.path} (${field.type}${itemType})`,
      used: usedFields.has(field.path) && field.path !== currentField,
    };
  });
  return [...options.filter((option) => !option.used), ...options.filter((option) => option.used)];
}

export function firstField(schema: FieldSchema[], predicate: (field: FieldSchema) => boolean): string {
  const field = schema.find(predicate);
  return field ? field.path : '';
}

/**
 * Выводит пару «обёртка + разметка» из блока, понимая устаревший `format`.
 * Дублирует blockFormatting из src/lib/render.ts (клиент не импортирует
 * серверный рантайм) — меняйте обе реализации вместе.
 */
export function getBlockFormatting(block: TemplateBlock): { wrap: FieldWrap; markup: boolean } {
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

/** Создаёт новый блок с разумными значениями по умолчанию. */
export function createBlock(kind: BlockKind, schema: FieldSchema[]): TemplateBlock {
  const firstStringField = (): string => firstField(schema, (field) => field.type === 'string' || field.type === 'number');

  switch (kind) {
    case 'image':
      return {
        id: uid(),
        kind: 'image',
        field: firstField(schema, (field) => /image|photo|img|picture|pic/i.test(field.path)) || firstStringField(),
      };
    case 'list':
      return { id: uid(), kind: 'list', field: firstField(schema, (field) => field.type === 'array'), translate: true, itemFormat: 'plain' };
    case 'links':
      return {
        id: uid(),
        kind: 'links',
        field: firstField(schema, (field) => field.type === 'array' && field.itemType === 'object'),
        nameField: 'name',
        urlField: 'url',
        translate: true,
      };
    case 'literal':
      return { id: uid(), kind: 'literal', text: `Текст: {{${firstStringField() || 'name'}}}` };
    case 'separator':
      return { id: uid(), kind: 'separator' };
    case 'field':
    default:
      return { id: uid(), kind: 'field', field: firstStringField(), wrap: 'none', markup: true, translate: true };
  }
}

export function addBlock(template: Template, kind: BlockKind, schema: FieldSchema[]): Template {
  return { ...template, blocks: [...template.blocks, createBlock(kind, schema)] };
}

export function updateBlock(template: Template, blockId: string, patch: Partial<TemplateBlock>): Template {
  return {
    ...template,
    blocks: template.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
  };
}

export function moveBlock(template: Template, blockId: string, direction: -1 | 1): Template {
  const index = template.blocks.findIndex((block) => block.id === blockId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= template.blocks.length) return template;

  const blocks = [...template.blocks];
  [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
  return { ...template, blocks };
}

export function removeBlock(template: Template, blockId: string): Template {
  return { ...template, blocks: template.blocks.filter((block) => block.id !== blockId) };
}

/** Перемещает блок `fromId` в «зазор» `insertIndex` (0..blocks.length). */
export function moveBlockToIndex(template: Template, fromId: string, insertIndex: number): Template {
  const fromIndex = template.blocks.findIndex((block) => block.id === fromId);
  if (fromIndex < 0) return template;

  const blocks = [...template.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  const targetIndex = Math.max(0, Math.min(blocks.length, insertIndex > fromIndex ? insertIndex - 1 : insertIndex));
  if (targetIndex === fromIndex) return template;

  blocks.splice(targetIndex, 0, moved);
  return { ...template, blocks };
}
