import { findSoftRefs, referenceReasons, type TextCell } from './orphans';
import { rewriteCellValue } from './rewrite';
import type { MediaFile, MorphRewrite, MorphRow, ReassignPlan, SoftRewrite } from './types';

export function planReassign(options: {
  canonical: MediaFile;
  extras: MediaFile[];
  morphRows: MorphRow[];
  cells: TextCell[];
}): ReassignPlan {
  const { canonical, extras, morphRows, cells } = options;
  const extraIds = extras.map((file) => file.id);
  const extraSet = new Set(extraIds);

  const morphUpdates: MorphRewrite[] = [];
  const existingCanonical = new Set(
    morphRows
      .filter((row) => row.fileId === canonical.id)
      .map((row) => morphKey(row.relatedId, row.relatedType, row.field))
  );

  for (const row of morphRows) {
    if (!extraSet.has(row.fileId)) {
      continue;
    }

    const key = morphKey(row.relatedId, row.relatedType, row.field);
    morphUpdates.push({
      fromFileId: row.fileId,
      toFileId: canonical.id,
      relatedId: row.relatedId,
      relatedType: row.relatedType,
      field: row.field,
      action: existingCanonical.has(key) ? 'drop-duplicate' : 'update',
    });

    if (!existingCanonical.has(key)) {
      existingCanonical.add(key);
    }
  }

  const softRewrites: SoftRewrite[] = [];
  for (const cell of cells) {
    const rewritten = rewriteCellValue(cell.value, extras, canonical);
    if (rewritten.replacements > 0) {
      softRewrites.push({
        relatedType: cell.relatedType,
        relatedId: cell.relatedId,
        field: cell.field,
        replacements: rewritten.replacements,
      });
    }
  }

  return {
    canonicalId: canonical.id,
    extraIds,
    morphUpdates,
    softRewrites,
    filesToDelete: extraIds,
  };
}

export function applyReassignInMemory(options: {
  canonical: MediaFile;
  extras: MediaFile[];
  morphRows: MorphRow[];
  cells: TextCell[];
}): { morphRows: MorphRow[]; cells: TextCell[]; plan: ReassignPlan } {
  const plan = planReassign(options);
  const extraSet = new Set(options.extras.map((file) => file.id));

  const nextMorph: MorphRow[] = [];
  const seen = new Set<string>();

  for (const row of options.morphRows) {
    if (!extraSet.has(row.fileId)) {
      nextMorph.push(row);
      if (row.fileId === options.canonical.id) {
        seen.add(morphKey(row.relatedId, row.relatedType, row.field));
      }
      continue;
    }

    const key = morphKey(row.relatedId, row.relatedType, row.field);
    if (seen.has(key) || options.morphRows.some((existing) => existing.fileId === options.canonical.id && morphKey(existing.relatedId, existing.relatedType, existing.field) === key)) {
      continue;
    }

    seen.add(key);
    nextMorph.push({
      ...row,
      fileId: options.canonical.id,
    });
  }

  const nextCells = options.cells.map((cell) => {
    const rewritten = rewriteCellValue(cell.value, options.extras, options.canonical);
    return { ...cell, value: rewritten.value };
  });

  return { morphRows: nextMorph, cells: nextCells, plan };
}

export function verifyExtrasUnreferenced(options: {
  extraIds: number[];
  morphRows: MorphRow[];
  cells: TextCell[];
  extras: MediaFile[];
}): { fileId: number; reasons: string[] }[] {
  const softHits = findSoftRefs(options.extras, options.cells);
  return referenceReasons({
    fileIds: options.extraIds,
    morphRows: options.morphRows,
    softHits,
  });
}

function morphKey(relatedId: number, relatedType: string, field: string): string {
  return `${relatedType}#${relatedId}.${field}`;
}
