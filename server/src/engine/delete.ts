import { findSoftRefs, referenceReasons, type TextCell } from './orphans';
import { StillReferencedError, type DeletePlan, type MediaFile, type MorphRow } from './types';

export function planDelete(options: {
  fileIds: number[];
  files: MediaFile[];
  morphRows: MorphRow[];
  cells: TextCell[];
}): DeletePlan {
  const wanted = new Set(options.fileIds);
  const files = options.files.filter((file) => wanted.has(file.id));
  const softHits = findSoftRefs(files, options.cells);
  const blocked = referenceReasons({
    fileIds: options.fileIds,
    morphRows: options.morphRows,
    softHits,
  });

  return {
    fileIds: options.fileIds,
    blocked,
  };
}

export function assertDeletable(plan: DeletePlan) {
  if (plan.blocked.length > 0) {
    throw new StillReferencedError(plan.blocked);
  }
}
