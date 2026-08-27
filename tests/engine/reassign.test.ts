import { describe, expect, it } from 'vitest';

import { applyReassignInMemory, verifyExtrasUnreferenced } from '../../server/src/engine/reassign';
import type { MediaFile } from '../../server/src/engine/types';

function file(id: number, hash: string): MediaFile {
  return {
    id,
    documentId: `doc-${id}`,
    name: `${hash}.png`,
    hash,
    url: `/uploads/${hash}.png`,
    mime: 'image/png',
    size: 10,
    width: 100,
    height: 80,
    folderPath: '/',
    updatedAt: '2026-01-01T00:00:00.000Z',
    formats: {
      thumbnail: { hash: `thumbnail_${hash}`, url: `/uploads/thumbnail_${hash}.png` },
    },
  };
}

describe('reassign rewrite + verify', () => {
  it('rewrites morph rows and Blocks snapshots to the canonical file, then verifies extras are clean', () => {
    const canonical = file(1, 'keep_aaaa1111');
    const extra = file(2, 'drop_bbbb2222');

    const blocks = [
      {
        type: 'image',
        image: {
          hash: extra.hash,
          url: extra.url,
          name: extra.name,
          mime: extra.mime,
          size: extra.size,
        },
        children: [{ type: 'text', text: '' }],
      },
    ];

    const { morphRows, cells, plan } = applyReassignInMemory({
      canonical,
      extras: [extra],
      morphRows: [
        { fileId: extra.id, relatedId: 7, relatedType: 'api::article.article', field: 'cover' },
        { fileId: canonical.id, relatedId: 8, relatedType: 'api::article.article', field: 'og' },
      ],
      cells: [{ relatedType: 'api::article.article', relatedId: 7, field: 'body', value: blocks }],
    });

    expect(plan.morphUpdates).toEqual([
      {
        fromFileId: 2,
        toFileId: 1,
        relatedId: 7,
        relatedType: 'api::article.article',
        field: 'cover',
        action: 'update',
      },
    ]);

    expect(morphRows.find((row) => row.relatedId === 7)?.fileId).toBe(1);
    expect(morphRows.some((row) => row.fileId === 2)).toBe(false);

    const image = (cells[0].value as Array<{ image?: { hash: string; url: string } }>)[0].image;
    expect(image?.hash).toBe(canonical.hash);
    expect(image?.url).toBe(canonical.url);

    const blocked = verifyExtrasUnreferenced({
      extraIds: [extra.id],
      morphRows,
      cells,
      extras: [extra],
    });

    expect(blocked).toEqual([]);
  });

  it('drops a morph row when the canonical already occupies the same field', () => {
    const canonical = file(1, 'keep_aaaa1111');
    const extra = file(2, 'drop_bbbb2222');

    const { morphRows, plan } = applyReassignInMemory({
      canonical,
      extras: [extra],
      morphRows: [
        { fileId: canonical.id, relatedId: 3, relatedType: 'api::page.page', field: 'gallery' },
        { fileId: extra.id, relatedId: 3, relatedType: 'api::page.page', field: 'gallery' },
      ],
      cells: [],
    });

    expect(plan.morphUpdates[0].action).toBe('drop-duplicate');
    expect(morphRows).toEqual([
      { fileId: 1, relatedId: 3, relatedType: 'api::page.page', field: 'gallery' },
    ]);
  });
});
