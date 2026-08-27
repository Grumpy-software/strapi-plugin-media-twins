import { applyTokenReplacements, buildReplacementMap } from './tokens';
import type { MediaFile } from './types';

export interface RewriteResult {
  value: unknown;
  replacements: number;
}

export function rewriteCellValue(
  value: unknown,
  extras: MediaFile[],
  canonical: MediaFile
): RewriteResult {
  const replacementMaps = extras.map((extra) => buildReplacementMap(extra, canonical));
  const extraByHash = new Map<string, MediaFile>();
  const extraByUrl = new Map<string, MediaFile>();

  for (const extra of extras) {
    extraByHash.set(extra.hash, extra);
    extraByUrl.set(extra.url, extra);
    if (extra.formats) {
      for (const format of Object.values(extra.formats)) {
        if (format?.hash) extraByHash.set(format.hash, extra);
        if (format?.url) extraByUrl.set(format.url, extra);
      }
    }
  }

  return rewriteNode(value, { replacementMaps, extraByHash, extraByUrl, canonical });
}

function rewriteNode(
  value: unknown,
  ctx: {
    replacementMaps: Array<Array<[string, string]>>;
    extraByHash: Map<string, MediaFile>;
    extraByUrl: Map<string, MediaFile>;
    canonical: MediaFile;
  }
): RewriteResult {
  if (value == null) {
    return { value, replacements: 0 };
  }

  if (typeof value === 'string') {
    let next = value;
    let replacements = 0;
    for (const map of ctx.replacementMaps) {
      const applied = applyTokenReplacements(next, map);
      next = applied.value;
      replacements += applied.replacements;
    }
    return { value: next, replacements };
  }

  if (Array.isArray(value)) {
    let replacements = 0;
    const items = value.map((item) => {
      const rewritten = rewriteNode(item, ctx);
      replacements += rewritten.replacements;
      return rewritten.value;
    });
    return { value: items, replacements };
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (isFileSnapshot(record)) {
      const extra =
        (typeof record.hash === 'string' && ctx.extraByHash.get(record.hash)) ||
        (typeof record.url === 'string' && ctx.extraByUrl.get(record.url));

      if (extra) {
        return {
          value: snapshotFromFile(ctx.canonical, record),
          replacements: 1,
        };
      }
    }

    let replacements = 0;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      const rewritten = rewriteNode(child, ctx);
      next[key] = rewritten.value;
      replacements += rewritten.replacements;
    }
    return { value: next, replacements };
  }

  return { value, replacements: 0 };
}

function isFileSnapshot(value: Record<string, unknown>): boolean {
  return typeof value.hash === 'string' && typeof value.url === 'string';
}

function snapshotFromFile(file: MediaFile, previous: Record<string, unknown>): Record<string, unknown> {
  return {
    ...previous,
    id: file.id,
    documentId: file.documentId ?? previous.documentId,
    name: file.name,
    alternativeText: file.alternativeText ?? previous.alternativeText ?? null,
    caption: file.caption ?? previous.caption ?? null,
    width: file.width ?? previous.width ?? null,
    height: file.height ?? previous.height ?? null,
    formats: file.formats ?? previous.formats ?? null,
    hash: file.hash,
    ext: file.ext ?? previous.ext ?? null,
    mime: file.mime,
    size: file.size,
    url: file.url,
    provider: file.provider ?? previous.provider ?? null,
  };
}
