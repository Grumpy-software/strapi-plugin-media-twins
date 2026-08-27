import { blobContainsToken, fileTokens } from './tokens';
import type { IgnoreRule, MediaFile, MorphRow, SoftRefHit } from './types';

export function isFileIgnored(file: MediaFile, rules: IgnoreRule[]): boolean {
  return rules.some((rule) => {
    if (rule.kind === 'file') {
      return rule.fileId === file.id;
    }

    const path = rule.folderPath;
    if (!path) {
      return false;
    }

    return file.folderPath === path || file.folderPath.startsWith(`${path}/`);
  });
}

export function morphReferencedIds(rows: MorphRow[]): Set<number> {
  return new Set(rows.map((row) => row.fileId));
}

export function findSoftRefs(files: MediaFile[], cells: TextCell[]): SoftRefHit[] {
  const indexed = files.map((file) => ({ file, tokens: fileTokens(file) }));
  const hits: SoftRefHit[] = [];

  for (const cell of cells) {
    const blob = stringifyCell(cell.value);
    if (!blob) {
      continue;
    }

    for (const { file, tokens } of indexed) {
      const token = blobContainsToken(blob, tokens);
      if (token) {
        hits.push({
          fileId: file.id,
          relatedType: cell.relatedType,
          relatedId: cell.relatedId,
          field: cell.field,
          token,
        });
      }
    }
  }

  return hits;
}

export function unusedFileIds(options: {
  files: MediaFile[];
  morphRows: MorphRow[];
  softHits?: SoftRefHit[];
  ignoreRules?: IgnoreRule[];
}): number[] {
  const referenced = morphReferencedIds(options.morphRows);
  for (const hit of options.softHits ?? []) {
    referenced.add(hit.fileId);
  }

  return options.files
    .filter((file) => !referenced.has(file.id) && !isFileIgnored(file, options.ignoreRules ?? []))
    .map((file) => file.id)
    .sort((a, b) => a - b);
}

export function referenceReasons(options: {
  fileIds: number[];
  morphRows: MorphRow[];
  softHits: SoftRefHit[];
}): { fileId: number; reasons: string[] }[] {
  const wanted = new Set(options.fileIds);
  const reasons = new Map<number, string[]>();

  for (const id of options.fileIds) {
    reasons.set(id, []);
  }

  for (const row of options.morphRows) {
    if (!wanted.has(row.fileId)) {
      continue;
    }
    reasons.get(row.fileId)!.push(`morph:${row.relatedType}#${row.relatedId}.${row.field}`);
  }

  for (const hit of options.softHits) {
    if (!wanted.has(hit.fileId)) {
      continue;
    }
    reasons.get(hit.fileId)!.push(`soft:${hit.relatedType}#${hit.relatedId}.${hit.field}`);
  }

  return [...reasons.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([fileId, list]) => ({ fileId, reasons: list }));
}

export interface TextCell {
  relatedType: string;
  relatedId: number;
  field: string;
  value: unknown;
}

export function stringifyCell(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
