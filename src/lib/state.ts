/**
 * Работа с файловой системой: папки данных, сессии (resume), шаблоны, входные файлы.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { DataFileKind, InputFileInfo, Template, TemplateListItem, TranslateTarget, TranslationSession } from '../types';

/** Корень проекта (на уровень выше build/lib). */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const DATA_DIRS = {
  input: path.join(ROOT_DIR, 'data', 'input'),
  output: path.join(ROOT_DIR, 'data', 'output'),
  sessions: path.join(ROOT_DIR, 'data', 'sessions'),
  templates: path.join(ROOT_DIR, 'data', 'templates'),
} as const;

export function ensureDirectories(): void {
  for (const directory of Object.values(DATA_DIRS)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 20);
}

export function sessionIdFor(params: {
  sourceText: string;
  targetLanguage: string;
  translateTargets: TranslateTarget[];
}): string {
  return hash(JSON.stringify({ source: params.sourceText, language: params.targetLanguage, targets: params.translateTargets }));
}

export function loadSession(id: string): TranslationSession | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIRS.sessions, id + '.json'), 'utf8')) as TranslationSession;
  } catch {
    return null;
  }
}

export function saveSession(id: string, session: TranslationSession): void {
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(DATA_DIRS.sessions, id + '.json'), JSON.stringify(session, null, 2), 'utf8');
}

/** Приводит имя к безопасному имени файла. */
export function sanitizeFilename(name: string): string {
  return String(name)
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

// ---------- шаблоны ----------

export function saveTemplate(template: Template, id?: string): string {
  ensureDirectories();
  const templateId = id ?? 'tpl_' + hash(JSON.stringify(template) + Date.now());
  fs.writeFileSync(path.join(DATA_DIRS.templates, templateId + '.json'), JSON.stringify(template, null, 2), 'utf8');
  return templateId;
}

export function listTemplates(): TemplateListItem[] {
  ensureDirectories();
  try {
    return fs
      .readdirSync(DATA_DIRS.templates)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const id = file.replace(/\.json$/, '');
        const stats = fs.statSync(path.join(DATA_DIRS.templates, file));
        return { id, name: id, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function loadTemplate(id: string): Template | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIRS.templates, id + '.json'), 'utf8')) as Template;
  } catch {
    return null;
  }
}

// ---------- входные файлы (наблюдаемая папка) ----------

export function listInputFiles(): InputFileInfo[] {
  ensureDirectories();
  try {
    return fs
      .readdirSync(DATA_DIRS.input)
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .map((file) => ({ name: file, size: fs.statSync(path.join(DATA_DIRS.input, file)).size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function readInputFile(name: string): string {
  const safeName = path.basename(name);
  const filePath = path.join(DATA_DIRS.input, safeName);
  if (!fs.existsSync(filePath)) throw new Error('Файл не найден: ' + safeName);
  return fs.readFileSync(filePath, 'utf8');
}

// ---------- выходные файлы (сохранённые переводы) ----------

/** Список JSON-файлов в папке output (готовые переводы), новые сверху. */
export function listOutputFiles(): InputFileInfo[] {
  ensureDirectories();
  try {
    return fs
      .readdirSync(DATA_DIRS.output)
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .map((file) => {
        const stats = fs.statSync(path.join(DATA_DIRS.output, file));
        return { name: file, size: stats.size };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Читает JSON-файл из папки output. */
export function readOutputFile(name: string): string {
  const safeName = path.basename(name);
  const filePath = path.join(DATA_DIRS.output, safeName);
  if (!fs.existsSync(filePath)) throw new Error('Файл не найден: ' + safeName);
  return fs.readFileSync(filePath, 'utf8');
}

function withExtension(name: string, extension: string): string {
  const safe = sanitizeFilename(name) || 'file';
  return safe.toLowerCase().endsWith('.' + extension) ? safe : `${safe}.${extension}`;
}

/** Имя выходного файла экспорта (GPX/KML). */
export function buildExportFileName(metaName: string, format: string, explicit?: string): string {
  const extension = format === 'kml' ? 'kml' : 'gpx';
  if (explicit && explicit.trim()) return withExtension(explicit, extension);
  return `${sanitizeFilename(metaName) || 'points'}.${extension}`;
}

/** Имя файла переведённого JSON. */
export function buildTranslatedFileName(metaName: string, targetLanguage: string, explicit?: string): string {
  if (explicit && explicit.trim()) return withExtension(explicit, 'json');
  return `${sanitizeFilename(metaName || 'translated')}_${targetLanguage}.json`;
}

/** Существует ли файл в папке output. */
export function outputFileExists(fileName: string): boolean {
  return fs.existsSync(path.join(DATA_DIRS.output, path.basename(fileName)));
}

// ---------- действия с файлами input/output ----------

const DATA_DIR_BY_KIND: Record<DataFileKind, string> = {
  input: DATA_DIRS.input,
  output: DATA_DIRS.output,
};

/** Безопасное имя файла: без путей и запрещённых символов, пробелы сохраняются. */
function sanitizeDataFileName(name: string): string {
  return String(name)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

/** Проверяет, что файл существует и лежит внутри папки своего типа. */
function dataFile(kind: DataFileKind, name: string): { dir: string; fileName: string; filePath: string } {
  const dir = DATA_DIR_BY_KIND[kind];
  if (!dir) throw new Error('Неизвестный тип файла: ' + String(kind));
  const fileName = path.basename(String(name ?? ''));
  if (fileName === '' || fileName === '.' || fileName === '..') throw new Error('Не указано имя файла');
  const filePath = path.join(dir, fileName);
  if (!filePath.startsWith(dir)) throw new Error('Недопустимое имя файла');
  if (!fs.existsSync(filePath)) throw new Error('Файл не найден: ' + fileName);
  return { dir, fileName, filePath };
}

/** Удаляет файл из папки input или output. */
export function deleteDataFile(kind: DataFileKind, name: string): string {
  const { filePath, fileName } = dataFile(kind, name);
  fs.unlinkSync(filePath);
  return fileName;
}

/** Переименовывает файл в папке input или output, сохраняя расширение. */
export function renameDataFile(kind: DataFileKind, name: string, newName: string): string {
  const { dir, fileName, filePath } = dataFile(kind, name);
  const extension = path.extname(fileName);
  let nextName = sanitizeDataFileName(newName);
  if (nextName === '') throw new Error('Пустое имя файла');
  if (extension !== '' && !nextName.toLowerCase().endsWith(extension.toLowerCase())) nextName += extension;
  if (nextName === fileName) return fileName;

  const nextPath = path.join(dir, nextName);
  if (fs.existsSync(nextPath)) throw new Error('Файл с таким именем уже есть: ' + nextName);
  fs.renameSync(filePath, nextPath);
  return nextName;
}

/** Читает файл из папки input или output (скачивание / «поделиться»). */
export function readDataFile(kind: DataFileKind, name: string): { fileName: string; data: Buffer } {
  const { filePath, fileName } = dataFile(kind, name);
  return { fileName, data: fs.readFileSync(filePath) };
}
