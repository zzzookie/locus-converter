/**
 * Генерация KML 2.2 из списка точек и шаблона.
 */

import { cdata, escapeHtml, escapeXml, isCoordinate, resolvePath } from './util';
import { normalizeTemplate, pickPointUrl, renderName, renderDescription } from './render';
import type { KmlBuildOptions } from '../types';

export function buildKml(options: KmlBuildOptions): string {
  const template = normalizeTemplate(options.template);
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">');
  lines.push('<Document>');

  if (options.metaName) lines.push(`  <name>${escapeXml(options.metaName)}</name>`);
  if (options.metaDesc) lines.push(`  <description>${escapeXml(options.metaDesc)}</description>`);

  for (const point of options.points) {
    const lat = resolvePath(point, template.latField);
    const lon = resolvePath(point, template.lonField);
    if (!isCoordinate(lat) || !isCoordinate(lon)) continue;

    const name = renderName(point, template);
    const description = renderDescription(point, template);

    // В KML нет <url>/<urlname>: ссылку добавляем в описание, если её там ещё нет.
    const link = pickPointUrl(point, template);
    const linkHtml =
      link !== null && !description.includes(link.url)
        ? `<a href="${escapeXml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.urlName)}</a>`
        : '';
    const fullDescription = linkHtml ? (description ? `${description}<br>${linkHtml}` : linkHtml) : description;

    lines.push('  <Placemark>');
    lines.push(`    <name>${escapeXml(name)}</name>`);
    if (fullDescription) lines.push(`    <description>${cdata(fullDescription)}</description>`);
    lines.push(`    <Point><coordinates>${escapeXml(lon)},${escapeXml(lat)},0</coordinates></Point>`);
    lines.push('  </Placemark>');
  }

  lines.push('</Document>');
  lines.push('</kml>');
  return lines.join('\n');
}
