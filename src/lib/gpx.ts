/**
 * Генерация GPX 1.1 из списка точек и шаблона.
 */

import { cdata, escapeXml, isCoordinate, resolvePath } from './util';
import { normalizeTemplate, pickPointUrl, renderName, renderDescription } from './render';
import type { GpxBuildOptions } from '../types';

export function buildGpx(options: GpxBuildOptions): string {
  const template = normalizeTemplate(options.template);
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" ' +
      `version="1.1" creator="${escapeXml(options.creator ?? 'JSON-to-GPX')}">`
  );

  if (options.metaName || options.metaDesc) {
    lines.push('  <metadata>');
    if (options.metaName) lines.push(`    <name>${escapeXml(options.metaName)}</name>`);
    if (options.metaDesc) lines.push(`    <desc>${escapeXml(options.metaDesc)}</desc>`);
    lines.push('  </metadata>');
  }

  for (const point of options.points) {
    const lat = resolvePath(point, template.latField);
    const lon = resolvePath(point, template.lonField);
    if (!isCoordinate(lat) || !isCoordinate(lon)) continue;

    const name = renderName(point, template);
    const description = renderDescription(point, template);
    const link = pickPointUrl(point, template);
    const symbol = template.iconField ? resolvePath(point, template.iconField) : undefined;

    lines.push(`<wpt lat="${escapeXml(lat)}" lon="${escapeXml(lon)}">`);
    lines.push(`  <name>${escapeXml(name)}</name>`);
    if (description) lines.push(`  <desc>${cdata(description)}</desc>`);
    if (link !== null) {
      lines.push(`  <url>${escapeXml(link.url)}</url>`);
      if (link.urlName) lines.push(`  <urlname>${escapeXml(link.urlName)}</urlname>`);
    }
    if (typeof symbol === 'string' || typeof symbol === 'number') lines.push(`  <sym>${escapeXml(symbol)}</sym>`);
    lines.push('</wpt>');
  }

  lines.push('</gpx>');
  return lines.join('\n');
}
