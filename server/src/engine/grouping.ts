import { hammingDistanceHex } from './hash';
import type { FileGroup, Fingerprint, MediaFile } from './types';
import { UnionFind } from './union-find';

export function groupExactDuplicates(files: MediaFile[], fingerprints: Fingerprint[]): FileGroup[] {
  const byHash = new Map<string, number[]>();
  const fpByFile = indexFingerprints(fingerprints);

  for (const file of files) {
    const sha256 = fpByFile.get(file.id)?.sha256;
    if (!sha256) {
      continue;
    }
    const list = byHash.get(sha256) ?? [];
    list.push(file.id);
    byHash.set(sha256, list);
  }

  const fileById = indexFiles(files);
  const groups: FileGroup[] = [];

  for (const [sha256, ids] of byHash) {
    if (ids.length < 2) {
      continue;
    }

    const sorted = sortExact(ids, fileById);
    const canonicalId = sorted[0];

    groups.push({
      kind: 'exact',
      id: `exact:${sha256}`,
      canonicalId,
      fileIds: sorted,
      extraIds: sorted.slice(1),
      reason: sha256,
    });
  }

  return groups.sort((a, b) => b.fileIds.length - a.fileIds.length || a.canonicalId - b.canonicalId);
}

export function groupSimilarImages(options: {
  files: MediaFile[];
  fingerprints: Fingerprint[];
  threshold: number;
  skipExact?: boolean;
  exactGroups?: FileGroup[];
}): FileGroup[] {
  const { files, fingerprints, threshold, skipExact = true, exactGroups = [] } = options;
  const fpByFile = indexFingerprints(fingerprints);
  const fileById = indexFiles(files);

  const images = files.filter((file) => {
    if (!file.mime.startsWith('image/')) {
      return false;
    }
    const fp = fpByFile.get(file.id);
    return hasPerceptualSignal(fp);
  });

  const uf = new UnionFind();
  const pairDistance = new Map<string, number>();

  for (let i = 0; i < images.length; i += 1) {
    const a = images[i];
    const fpA = fpByFile.get(a.id)!;
    uf.add(a.id);

    for (let j = i + 1; j < images.length; j += 1) {
      const b = images[j];
      const fpB = fpByFile.get(b.id)!;
      const pDist = fpA.phash && fpB.phash ? hammingDistanceHex(fpA.phash, fpB.phash) : Number.POSITIVE_INFINITY;
      const dDist = fpA.dhash && fpB.dhash ? hammingDistanceHex(fpA.dhash, fpB.dhash) : Number.POSITIVE_INFINITY;
      const best = Math.min(pDist, dDist);

      if (best <= threshold) {
        uf.union(a.id, b.id);
        pairDistance.set(pairKey(a.id, b.id), best);
      }
    }
  }

  const exactMembership = new Map<number, string>();
  for (const group of exactGroups) {
    for (const id of group.fileIds) {
      exactMembership.set(id, group.reason);
    }
  }

  const groups: FileGroup[] = [];

  for (const ids of uf.groups()) {
    if (ids.length < 2) {
      continue;
    }

    if (skipExact && isPureExactGroup(ids, exactMembership)) {
      continue;
    }

    const sorted = sortSimilar(ids, fileById);
    const canonicalId = sorted[0];
    const nearest = nearestDistance(sorted, pairDistance);

    groups.push({
      kind: 'similar',
      id: `similar:${sorted.join('-')}`,
      canonicalId,
      fileIds: sorted,
      extraIds: sorted.slice(1),
      reason: `hamming<=${threshold}; nearest=${nearest}`,
    });
  }

  return groups.sort((a, b) => b.fileIds.length - a.fileIds.length || a.canonicalId - b.canonicalId);
}

function isPureExactGroup(ids: number[], exactMembership: Map<number, string>): boolean {
  const first = exactMembership.get(ids[0]);
  if (!first) {
    return false;
  }
  return ids.every((id) => exactMembership.get(id) === first);
}

function sortExact(ids: number[], files: Map<number, MediaFile>): number[] {
  return [...ids].sort((a, b) => {
    const fa = files.get(a);
    const fb = files.get(b);
    const sizeDiff = (fb?.size ?? 0) - (fa?.size ?? 0);
    if (sizeDiff !== 0) {
      return sizeDiff;
    }
    return a - b;
  });
}

function sortSimilar(ids: number[], files: Map<number, MediaFile>): number[] {
  return [...ids].sort((a, b) => {
    const fa = files.get(a);
    const fb = files.get(b);
    const areaA = (fa?.width ?? 0) * (fa?.height ?? 0);
    const areaB = (fb?.width ?? 0) * (fb?.height ?? 0);
    if (areaB !== areaA) {
      return areaB - areaA;
    }
    const sizeDiff = (fb?.size ?? 0) - (fa?.size ?? 0);
    if (sizeDiff !== 0) {
      return sizeDiff;
    }
    return a - b;
  });
}

function nearestDistance(ids: number[], pairDistance: Map<string, number>): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const dist = pairDistance.get(pairKey(ids[i], ids[j]));
      if (typeof dist === 'number' && dist < best) {
        best = dist;
      }
    }
  }
  return Number.isFinite(best) ? best : -1;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function indexFiles(files: MediaFile[]): Map<number, MediaFile> {
  return new Map(files.map((file) => [file.id, file]));
}

function indexFingerprints(fingerprints: Fingerprint[]): Map<number, Fingerprint> {
  return new Map(fingerprints.map((fp) => [fp.fileId, fp]));
}

/**
 * Flat / solid-color images produce an all-zero pHash and dHash. Treating
 * those as similar would group every empty canvas together. Require at least
 * one non-zero perceptual hash before pairing.
 */
function hasPerceptualSignal(fp?: Fingerprint): boolean {
  if (!fp) {
    return false;
  }
  return isNonZeroHash(fp.phash) || isNonZeroHash(fp.dhash);
}

function isNonZeroHash(value?: string): boolean {
  return Boolean(value) && /[1-9a-f]/i.test(value);
}
