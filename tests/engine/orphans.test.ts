import { describe, expect, it } from 'vitest';

import { findSoftRefs, unusedFileIds } from '../../server/src/engine/orphans';
import type { MediaFile } from '../../server/src/engine/types';

function file(id: number, hash: string): MediaFile {
  return {
    id,
    name: `${hash}.png`,
    hash,
    url: `/uploads/${hash}.png`,
    mime: 'image/png',
    size: 10,
    folderPath: '/',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('orphan detection', () => {
  it('treats a Blocks image soft-ref as a reference even without a morph row', () => {
    const used = file(10, 'hero_ab12cd34');
    const unused = file(11, 'orphan_9900ffee');

    const blocks = [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Intro' }],
      },
      {
        type: 'image',
        image: {
          url: used.url,
          hash: used.hash,
          name: used.name,
          mime: used.mime,
          size: used.size,
        },
        children: [{ type: 'text', text: '' }],
      },
    ];

    const softHits = findSoftRefs([used, unused], [
      { relatedType: 'api::article.article', relatedId: 4, field: 'body', value: blocks },
    ]);

    expect(softHits.map((hit) => hit.fileId)).toEqual([10]);

    const orphans = unusedFileIds({
      files: [used, unused],
      morphRows: [],
      softHits,
    });

    expect(orphans).toEqual([11]);
  });

  it('keeps morph-related files out of the unused list', () => {
    const cover = file(1, 'cover_11111111');
    const loose = file(2, 'loose_22222222');

    expect(
      unusedFileIds({
        files: [cover, loose],
        morphRows: [{ fileId: 1, relatedId: 9, relatedType: 'api::page.page', field: 'cover' }],
        softHits: [],
      })
    ).toEqual([2]);
  });

  it('honours folder ignore rules', () => {
    const brand = file(3, 'logo_33333333');
    brand.folderPath = '/brand/logos';

    expect(
      unusedFileIds({
        files: [brand],
        morphRows: [],
        softHits: [],
        ignoreRules: [{ kind: 'folder', folderPath: '/brand' }],
      })
    ).toEqual([]);
  });
});
