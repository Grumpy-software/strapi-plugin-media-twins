import { describe, expect, it } from 'vitest';

import { assertDeletable, planDelete } from '../../server/src/engine/delete';
import { StillReferencedError } from '../../server/src/engine/types';
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

describe('delete safety net', () => {
  it('refuses delete when a file is still referenced by a morph row or Blocks soft-ref', () => {
    const referenced = file(4, 'live_cccc3333');

    const plan = planDelete({
      fileIds: [4],
      files: [referenced],
      morphRows: [],
      cells: [
        {
          relatedType: 'api::article.article',
          relatedId: 1,
          field: 'body',
          value: [
            {
              type: 'image',
              image: { hash: referenced.hash, url: referenced.url },
              children: [{ type: 'text', text: '' }],
            },
          ],
        },
      ],
    });

    expect(plan.blocked[0]?.fileId).toBe(4);
    expect(plan.blocked[0]?.reasons[0]).toContain('soft:');
    expect(() => assertDeletable(plan)).toThrow(StillReferencedError);
  });

  it('allows delete when the pre-delete scan finds no references', () => {
    const unused = file(5, 'gone_dddd4444');
    const plan = planDelete({
      fileIds: [5],
      files: [unused],
      morphRows: [],
      cells: [{ relatedType: 'api::article.article', relatedId: 1, field: 'body', value: 'no media here' }],
    });

    expect(plan.blocked).toEqual([]);
    expect(() => assertDeletable(plan)).not.toThrow();
  });
});
