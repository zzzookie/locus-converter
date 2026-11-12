/**
 * HTTP-сервер приложения: статика + REST API.
 */

import http, { type IncomingMessage, type ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { exec } from 'child_process';

import {
  DEFAULT_TARGET_LANGUAGE,
  MAX_REQUEST_BYTES,
  PORT,
  STATIC_DIR,
  TRANSLATION_BATCH_SIZE,
  TRANSLATION_CONCURRENCY,
} from './config';
import * as state from './lib/state';
import {
  analyzeSchema,
  applyBlockTranslation,
  buildTranslatedDocument,
  collectBlockStrings,
  detectLatLon,
  detectPoints,
  parseJson,
} from './lib/json-util';
import { defaultTemplate, getTranslateTargets, normalizeTemplate, renderDescription, renderName } from './lib/render';
import { translateStrings } from './lib/translate';
import { buildGpx } from './lib/gpx';
import { buildKml } from './lib/kml';
import { isCoordinate } from './lib/util';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  CheckOutputRequest,
  CheckOutputResponse,
  ConvertRequest,
  ConvertResponse,
  DeleteFileRequest,
  FileActionResponse,
  LoadInputRequest,
  LoadInputResponse,
  LoadOutputRequest,
  Point,
  PreviewRequest,
  RenameFileRequest,
  PreviewResponse,
  ResumeCheckRequest,
  ResumeCheckResponse,
  SaveTemplateRequest,
  SaveTemplateResponse,
  TranslationJob,
  TranslationSession,
  TranslationStartInfo,
  TranslateStartRequest,
} from './types';

state.ensureDirectories();

/** Активные задачи перевода (для опроса статуса из UI). */
const jobs = new Map<string, TranslationJob>();

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.on('data', (chunk: Buffer | string) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('Слишком большой запрос (лимит 100 МБ).'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as unknown) : {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reject(new Error('Некорректный JSON в теле запроса: ' + message));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function sendText(response: ServerResponse, statusCode: number, text: string, contentType = 'text/plain'): void {
  const body = Buffer.from(text, 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': contentType + '; charset=utf-8',
    'Content-Length': body.length,
  });
  response.end(body);
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function serveStatic(response: ServerResponse, pathname: string): void {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(STATIC_DIR, relativePath);
  if (!filePath.startsWith(STATIC_DIR)) {
    sendText(response, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, 404, 'Not found: ' + relativePath);
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': (MIME_TYPES[extension] ?? 'application/octet-stream') + '; charset=utf-8',
    });
    response.end(data);
  });
}

function serveDownload(response: ServerResponse, fileName: string, kind: 'input' | 'output' = 'output'): void {
  let file: { fileName: string; data: Buffer };
  try {
    file = state.readDataFile(kind, fileName);
  } catch {
    sendText(response, 404, 'Файл не найден');
    return;
  }

  const data = file.data;
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': data.length,
    'Content-Disposition': 'attachment; filename="' + encodeURIComponent(file.fileName) + '"',
  });
  response.end(data);
}

async function runTranslation(jobId: string, session: TranslationSession): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  const orderedStrings = session.strings;
  const alreadyTranslatedCount = orderedStrings.filter((value) => session.translated[value] !== undefined).length;
  const pendingStrings = orderedStrings.filter((value) => session.translated[value] === undefined);

  job.status = 'running';
  job.totalCount = orderedStrings.length;
  job.doneCount = alreadyTranslatedCount;
  job.message = 'Подготовка…';

  try {
    if (pendingStrings.length > 0) {
      const totalBatches = Math.ceil(pendingStrings.length / TRANSLATION_BATCH_SIZE);
      for (let start = 0; start < pendingStrings.length; start += TRANSLATION_BATCH_SIZE) {
        const chunk = pendingStrings.slice(start, start + TRANSLATION_BATCH_SIZE);
        const batchNumber = Math.floor(start / TRANSLATION_BATCH_SIZE) + 1;
        job.message = `Перевод: пакет ${batchNumber} из ${totalBatches} (${chunk.length} строк)`;

        const translatedChunk = await translateStrings(chunk, session.targetLanguage, {
          batchSize: chunk.length,
          concurrency: TRANSLATION_CONCURRENCY,
          onProgress: (done) => {
            job.doneCount = alreadyTranslatedCount + start + done;
            job.totalCount = orderedStrings.length;
          },
        });

        for (let i = 0; i < chunk.length; i++) {
          session.translated[chunk[i]] = translatedChunk[i];
        }
        state.saveSession(session.sessionId, session);
      }
    }

    const original = parseJson(session.sourceText);
    const { points, listField } = detectPoints(original);
    const translatedPoints: Point[] = JSON.parse(JSON.stringify(points)) as Point[];
    for (const point of translatedPoints) {
      for (const target of session.translateTargets) {
        applyBlockTranslation(point, target, session.translated);
      }
    }
    const document = buildTranslatedDocument(original, translatedPoints, listField);

    const fileName = session.outputFileName ?? state.buildTranslatedFileName(session.metaName, session.targetLanguage);
    fs.writeFileSync(path.join(state.DATA_DIRS.output, fileName), JSON.stringify(document, null, 2), 'utf8');

    session.translatedJson = document;
    session.translatedFileName = fileName;
    session.status = 'done';
    state.saveSession(session.sessionId, session);

    job.status = 'done';
    job.doneCount = orderedStrings.length;
    job.message = 'Перевод завершён';
    job.translatedJson = document;
    job.translatedFileName = fileName;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.status = 'error';
    job.error = message;
    session.status = 'error';
    session.lastError = message;
    state.saveSession(session.sessionId, session);
  }
}

function startTranslation(payload: TranslateStartRequest): TranslationStartInfo {
  const text = payload.text;
  if (!text) throw new Error('Пустой JSON для перевода.');

  const data = parseJson(text);
  const { points, listField } = detectPoints(data);

  const template = normalizeTemplate(payload.template);
  template.targetLanguage = payload.targetLanguage || template.targetLanguage || DEFAULT_TARGET_LANGUAGE;
  const targets = getTranslateTargets(template);
  const outputFileName = state.buildTranslatedFileName(payload.metaName ?? '', template.targetLanguage, payload.fileName);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const point of points) {
    for (const target of targets) {
      for (const value of collectBlockStrings(point, target)) {
        if (value && !seen.has(value)) {
          seen.add(value);
          ordered.push(value);
        }
      }
    }
  }

  const sessionId = state.sessionIdFor({
    sourceText: text,
    targetLanguage: template.targetLanguage,
    translateTargets: targets,
  });

  let session = state.loadSession(sessionId);
  let resumed = false;

  if (!session) {
    session = {
      sessionId,
      createdAt: new Date().toISOString(),
      targetLanguage: template.targetLanguage,
      translateTargets: targets,
      sourceText: text,
      listField,
      metaName: payload.metaName ?? '',
      outputFileName,
      strings: ordered,
      translated: {},
      batchSize: TRANSLATION_BATCH_SIZE,
      translatedJson: null,
      translatedFileName: null,
      status: 'idle',
    };
    state.saveSession(sessionId, session);
  } else {
    resumed = true;
    session.targetLanguage = template.targetLanguage;
    session.metaName = payload.metaName ?? session.metaName;
    session.outputFileName = outputFileName;
    session.strings = ordered;
  }

  if (session.translatedJson !== null && session.status === 'done') {
    let finalFileName = session.translatedFileName ?? '';
    if (finalFileName !== outputFileName) {
      fs.writeFileSync(path.join(state.DATA_DIRS.output, outputFileName), JSON.stringify(session.translatedJson, null, 2), 'utf8');
      session.translatedFileName = outputFileName;
      finalFileName = outputFileName;
      state.saveSession(session.sessionId, session);
    }
    const jobId = state.hash(sessionId + 'done' + Date.now());
    jobs.set(jobId, {
      status: 'done',
      doneCount: ordered.length,
      totalCount: ordered.length,
      message: 'Использован сохранённый перевод',
      translatedJson: session.translatedJson,
      translatedFileName: finalFileName || undefined,
    });
    return { jobId, sessionId, resumed: true, total: ordered.length };
  }

  const jobId = state.hash(sessionId + Date.now());
  jobs.set(jobId, {
    status: 'running',
    doneCount: ordered.filter((value) => session.translated[value] !== undefined).length,
    totalCount: ordered.length,
    message: 'Перевод…',
    sessionId,
  });
  void runTranslation(jobId, session);
  return { jobId, sessionId, resumed, total: ordered.length };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (request.method === 'GET' && !pathname.startsWith('/api/')) {
      serveStatic(response, pathname);
      return;
    }

    if (pathname === '/api/inputs' && request.method === 'GET') {
      sendJson(response, 200, { files: state.listInputFiles() });
      return;
    }

    if (pathname === '/api/load-input' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as LoadInputRequest;
      const payload: LoadInputResponse = { text: state.readInputFile(body.name), name: body.name };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/outputs' && request.method === 'GET') {
      sendJson(response, 200, { files: state.listOutputFiles() });
      return;
    }

    if (pathname === '/api/files/rename' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as RenameFileRequest;
      const payload: FileActionResponse = { file: state.renameDataFile(body.kind, body.name, body.newName) };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/files/delete' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as DeleteFileRequest;
      const payload: FileActionResponse = { file: state.deleteDataFile(body.kind, body.name) };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/load-output' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as LoadOutputRequest;
      const payload: LoadInputResponse = { text: state.readOutputFile(body.name), name: body.name };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/analyze' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as AnalyzeRequest;
      const data = parseJson(body.text);
      const { points, listField } = detectPoints(data);
      if (points.length === 0) throw new Error('Не найдено ни одной точки (объекта) в JSON.');
      const { lat, lon } = detectLatLon(points[0]);
      const schema = analyzeSchema(points);
      const payload: AnalyzeResponse = {
        pointCount: points.length,
        listField,
        latField: lat,
        lonField: lon,
        schema,
        points,
        template: defaultTemplate(schema, lat, lon),
      };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/preview' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as PreviewRequest;
      const payload: PreviewResponse = {
        name: renderName(body.point, body.template),
        html: renderDescription(body.point, body.template),
      };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/translate/start' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as TranslateStartRequest;
      sendJson(response, 200, startTranslation(body));
      return;
    }

    if (pathname === '/api/translate/status' && request.method === 'GET') {
      const jobId = url.searchParams.get('jobId');
      const job = jobId !== null ? jobs.get(jobId) : undefined;
      if (!job) {
        sendJson(response, 404, {
          error: 'Задача не найдена. Сервер мог быть перезапущен — запустите конвертацию снова, прогресс восстановится.',
        });
        return;
      }
      sendJson(response, 200, job);
      return;
    }

    if (pathname === '/api/translate/resume-check' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as ResumeCheckRequest;
      const template = normalizeTemplate(body.template);
      const targetLanguage = body.targetLanguage || template.targetLanguage || DEFAULT_TARGET_LANGUAGE;
      const sessionId = state.sessionIdFor({
        sourceText: body.text,
        targetLanguage,
        translateTargets: getTranslateTargets(template),
      });
      const session = state.loadSession(sessionId);

      if (session && session.translatedJson !== null && session.status === 'done') {
        const payload: ResumeCheckResponse = {
          resumeAvailable: true,
          translatedJson: session.translatedJson,
          translatedFileName: session.translatedFileName ?? undefined,
        };
        sendJson(response, 200, payload);
        return;
      }
      if (session) {
        const done = session.strings.filter((value) => session.translated[value] !== undefined).length;
        const payload: ResumeCheckResponse = { resumeAvailable: true, partial: true, done, total: session.strings.length };
        sendJson(response, 200, payload);
        return;
      }
      sendJson(response, 200, { resumeAvailable: false });
      return;
    }

    if (pathname === '/api/check-output' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as CheckOutputRequest;
      const file =
        body.kind === 'translated'
          ? state.buildTranslatedFileName(body.metaName ?? '', body.targetLanguage || DEFAULT_TARGET_LANGUAGE, body.fileName)
          : state.buildExportFileName(body.metaName ?? '', body.format ?? 'gpx', body.fileName);
      const payload: CheckOutputResponse = { file, exists: state.outputFileExists(file) };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === '/api/convert' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as ConvertRequest;
      const points: Point[] = Array.isArray(body.points) ? body.points : [];
      const template = normalizeTemplate(body.template);
      const format = (body.format ?? 'gpx').toLowerCase();
      const metaName = body.metaName || 'points';
      const metaDesc = body.metaDesc || '';
      const fileName = state.buildExportFileName(metaName, format, body.fileName);

      const content =
        format === 'kml'
          ? buildKml({ points, template, metaName, metaDesc })
          : buildGpx({ points, template, metaName, metaDesc, creator: body.creator });
      fs.writeFileSync(path.join(state.DATA_DIRS.output, fileName), content, 'utf8');

      const pointsWritten = points.filter((point) => {
        const lat = point[template.latField];
        const lon = point[template.lonField];
        return isCoordinate(lat) && isCoordinate(lon);
      }).length;

      const payload: ConvertResponse = {
        file: fileName,
        downloadUrl: '/api/download/' + encodeURIComponent(fileName),
        size: Buffer.byteLength(content),
        pointsWritten,
      };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname.startsWith('/api/download-input/') && request.method === 'GET') {
      serveDownload(response, pathname.replace('/api/download-input/', ''), 'input');
      return;
    }

    if (pathname.startsWith('/api/download/') && request.method === 'GET') {
      serveDownload(response, pathname.replace('/api/download/', ''));
      return;
    }

    if (pathname === '/api/templates' && request.method === 'GET') {
      sendJson(response, 200, { templates: state.listTemplates() });
      return;
    }

    if (pathname === '/api/templates/save' && request.method === 'POST') {
      const body = (await readJsonBody(request)) as SaveTemplateRequest;
      const payload: SaveTemplateResponse = { id: state.saveTemplate(body.template, body.id) };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname.startsWith('/api/templates/') && request.method === 'GET') {
      const id = pathname.replace('/api/templates/', '');
      const template = state.loadTemplate(id);
      if (!template) {
        sendJson(response, 404, { error: 'Шаблон не найден' });
        return;
      }
      sendJson(response, 200, { template });
      return;
    }

    sendJson(response, 404, { error: 'Неизвестный маршрут: ' + pathname });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 400, { error: message });
  }
});

server.listen(PORT, () => {
  console.log('Locus Converter запущен: http://localhost:' + PORT);
  console.log('Папка ввода:  ' + state.DATA_DIRS.input);
  console.log('Папка вывода: ' + state.DATA_DIRS.output);
  if (process.argv.includes('--open')) {
    exec('start "" "http://localhost:' + PORT + '"', () => {});
  }
});


