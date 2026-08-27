import { describe, expect, it } from 'vitest';

import { groupExactDuplicates } from '../../server/src/engine/grouping';
import { sha256Hex } from '../../server/src/engine/hash';
import type { Fingerprint, MediaFile } from '../../server/src/engine/types';

function file(partial: Partial<MediaFile> & Pick<MediaFile, 'id' | 'name'>): MediaFile {
  return {
    hash: `hash-${partial.id}`,
    url: `/uploads/hash-${partial.id}.png`,
    mime: 'image/png',
    size: 12,
    folderPath: '/',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function fp(fileId: number, sha256: string): Fingerprint {
  return { fileId, sha256, phash: '', dhash: '', byteSize: 10 };
}

describe('exact hash grouping', () => {
  it('groups files that share the same SHA-256 and omits singletons', () => {
    const same = sha256Hex(Buffer.from('identical-bytes'));
    const other = sha256Hex(Buffer.from('different-bytes'));

    const files = [
      file({ id: 1, name: 'hero.png', size: 40 }),
      file({ id: 2, name: 'hero-copy.png', size: 40 }),
      file({ id: 3, name: 'other.png', size: 8 }),
    ];

    const groups = groupExactDuplicates(files, [fp(1, same), fp(2, same), fp(3, other)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].fileIds).toEqual([1, 2]);
    expect(groups[0].canonicalId).toBe(1);
    expect(groups[0].extraIds).toEqual([2]);
    expect(groups[0].reason).toBe(same);
  });

  it('does not group files with different SHA-256 values', () => {
    const files = [file({ id: 1, name: 'a.png' }), file({ id: 2, name: 'b.png' })];
    const groups = groupExactDuplicates(files, [
      fp(1, sha256Hex(Buffer.from('a'))),
      fp(2, sha256Hex(Buffer.from('b'))),
    ]);

    expect(groups).toEqual([]);
  });

  it('suggests the largest file as canonical, then the oldest id', () => {
    const sha = sha256Hex(Buffer.from('twins'));
    const files = [
      file({ id: 8, name: 'small.png', size: 4 }),
      file({ id: 3, name: 'large.png', size: 40 }),
      file({ id: 5, name: 'also-large.png', size: 40 }),
    ];

    const [group] = groupExactDuplicates(files, [fp(8, sha), fp(3, sha), fp(5, sha)]);
    expect(group.canonicalId).toBe(3);
    expect(group.fileIds).toEqual([3, 5, 8]);
  });
});
