import type { Core } from '@strapi/strapi';

import { FILE_UID } from '../constants';
import type { MediaFile } from '../engine/types';

export async function loadFiles(strapi: Core.Strapi): Promise<MediaFile[]> {
  const rows = await strapi.db.query(FILE_UID).findMany({
    select: [
      'id',
      'documentId',
      'name',
      'hash',
      'url',
      'ext',
      'mime',
      'size',
      'width',
      'height',
      'formats',
      'folderPath',
      'updatedAt',
      'alternativeText',
      'caption',
      'provider',
    ],
    orderBy: { id: 'asc' },
  });

  return rows.map((row: Record<string, unknown>) => normalizeFile(row));
}

export async function loadFileById(strapi: Core.Strapi, id: number): Promise<MediaFile | null> {
  const row = await strapi.db.query(FILE_UID).findOne({ where: { id } });
  return row ? normalizeFile(row) : null;
}

export async function removeFiles(strapi: Core.Strapi, ids: number[]) {
  const upload = strapi.plugin('upload').service('upload') as {
    remove: (file: Record<string, unknown>) => Promise<unknown>;
  };

  for (const id of ids) {
    const file = await strapi.db.query(FILE_UID).findOne({ where: { id } });
    if (!file) {
      continue;
    }
    await upload.remove(file);
  }
}

export function normalizeFile(row: Record<string, unknown>): MediaFile {
  return {
    id: Number(row.id),
    documentId: row.documentId ? String(row.documentId) : undefined,
    name: String(row.name ?? ''),
    hash: String(row.hash ?? ''),
    url: String(row.url ?? ''),
    ext: (row.ext as string | null) ?? null,
    mime: String(row.mime ?? ''),
    size: Number(row.size ?? 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    formats: (row.formats as MediaFile['formats']) ?? null,
    folderPath: String(row.folderPath ?? '/'),
    updatedAt: String(row.updatedAt ?? ''),
    alternativeText: (row.alternativeText as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
  };
}
