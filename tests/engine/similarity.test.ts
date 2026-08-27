import { describe, expect, it } from 'vitest';

import { groupSimilarImages } from '../../server/src/engine/grouping';
import { bitsToHex, dHashFromPixels, hammingDistanceHex, pHashFromPixels } from '../../server/src/engine/hash';
import type { MediaFile } from '../../server/src/engine/types';

function file(id: number, mime = 'image/jpeg'): MediaFile {
  return {
    id,
    name: `img-${id}.jpg`,
    hash: `h${id}`,
    url: `/uploads/h${id}.jpg`,
    mime,
    size: 20 + id,
    width: 800,
    height: 600,
    folderPath: '/',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function hexFromPattern(seed: number, flips: number[] = []) {
  const bits = Array.from({ length: 64 }, (_, index) => ((seed + index) % 3 === 0 ? 1 : 0));
  for (const flip of flips) {
    bits[flip] = bits[flip] ? 0 : 1;
  }
  return bitsToHex(bits);
}

describe('similarity threshold', () => {
  it('groups images when Hamming distance is within the threshold', () => {
    const a = hexFromPattern(1);
    const b = hexFromPattern(1, [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(hammingDistanceHex(a, b)).toBe(8);

    const groups = groupSimilarImages({
      files: [file(1), file(2)],
      fingerprints: [
        { fileId: 1, sha256: 'aa', phash: a, dhash: a, byteSize: 1 },
        { fileId: 2, sha256: 'bb', phash: b, dhash: 'ffffffffffff0000', byteSize: 1 },
      ],
      threshold: 10,
      skipExact: true,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].fileIds).toEqual([2, 1]);
    expect(groups[0].canonicalId).toBe(2);
  });

  it('does not group images when both hashes sit above the threshold', () => {
    const a = hexFromPattern(1);
    const b = hexFromPattern(1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(hammingDistanceHex(a, b)).toBe(12);

    const groups = groupSimilarImages({
      files: [file(1), file(2)],
      fingerprints: [
        { fileId: 1, sha256: 'aa', phash: a, dhash: a, byteSize: 1 },
        { fileId: 2, sha256: 'bb', phash: b, dhash: b, byteSize: 1 },
      ],
      threshold: 10,
    });

    expect(groups).toEqual([]);
  });

  it('with threshold 0 only groups perceptually identical hashes', () => {
    const hash = hexFromPattern(4);
    const near = hexFromPattern(4, [1]);

    const identical = groupSimilarImages({
      files: [file(1), file(2)],
      fingerprints: [
        { fileId: 1, sha256: 'a', phash: hash, dhash: hash, byteSize: 1 },
        { fileId: 2, sha256: 'b', phash: hash, dhash: hash, byteSize: 1 },
      ],
      threshold: 0,
    });
    expect(identical).toHaveLength(1);

    const notIdentical = groupSimilarImages({
      files: [file(1), file(2)],
      fingerprints: [
        { fileId: 1, sha256: 'a', phash: hash, dhash: hash, byteSize: 1 },
        { fileId: 2, sha256: 'b', phash: near, dhash: near, byteSize: 1 },
      ],
      threshold: 0,
    });
    expect(notIdentical).toEqual([]);
  });

  it('skips groups that are already exact SHA-256 twins', () => {
    const hash = hexFromPattern(2);
    const groups = groupSimilarImages({
      files: [file(1), file(2)],
      fingerprints: [
        { fileId: 1, sha256: 'same', phash: hash, dhash: hash, byteSize: 1 },
        { fileId: 2, sha256: 'same', phash: hash, dhash: hash, byteSize: 1 },
      ],
      threshold: 10,
      skipExact: true,
      exactGroups: [{ kind: 'exact', id: 'exact:same', canonicalId: 1, fileIds: [1, 2], extraIds: [2], reason: 'same' }],
    });

    expect(groups).toEqual([]);
  });

  it('computes a stable pHash/dHash from pixel matrices', () => {
    const flat = Array.from({ length: 32 }, () => Array(32).fill(128));
    expect(pHashFromPixels(flat)).toBe('0000000000000000');

    const gradient: number[][] = [];
    for (let y = 0; y < 8; y += 1) {
      gradient.push(Array.from({ length: 9 }, (_, x) => (8 - x) * 20));
    }
    const dhash = dHashFromPixels(gradient);
    expect(dhash).toHaveLength(16);
    expect(dhash).not.toBe('0000000000000000');
  });

  it('does not treat all-zero perceptual hashes as similar', () => {
    const groups = groupSimilarImages({
      files: [file(1), file(2)],
      fingerprints: [
        { fileId: 1, sha256: 'red', phash: '0000000000000000', dhash: '0000000000000000', byteSize: 1 },
        { fileId: 2, sha256: 'blue', phash: '0000000000000000', dhash: '0000000000000000', byteSize: 1 },
      ],
      threshold: 10,
    });
    expect(groups).toEqual([]);
  });

  it('does not put videos in similar groups', () => {
    const hash = hexFromPattern(3);
    const groups = groupSimilarImages({
      files: [file(1, 'video/mp4'), file(2, 'video/mp4')],
      fingerprints: [
        { fileId: 1, sha256: 'a', phash: hash, dhash: hash, byteSize: 1 },
        { fileId: 2, sha256: 'b', phash: hash, dhash: hash, byteSize: 1 },
      ],
      threshold: 10,
    });
    expect(groups).toEqual([]);
  });
});
