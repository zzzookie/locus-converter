/**
 * Глобальные настройки приложения.
 */

import path from 'path';

export const PORT = Number(process.env.PORT ?? 8123);

/** Папка со статикой (index.html, style.css, скомпилированный app.js). */
export const STATIC_DIR = path.join(__dirname, '..', 'static');

export const MAX_REQUEST_BYTES = 100 * 1024 * 1024;
export const TRANSLATION_BATCH_SIZE = 50;
export const TRANSLATION_CONCURRENCY = 8;
export const DEFAULT_TARGET_LANGUAGE = 'ru';
