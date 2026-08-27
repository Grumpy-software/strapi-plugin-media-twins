import type { Core } from '@strapi/strapi';

import { FINGERPRINT_UID } from '../constants';
import { computeImageHashes, hashFileBytes } from '../engine/image-hashes';
import type { Fingerprint, MediaFile } from '../engine/types';
import { readOriginalBytes } from './bytes';

export async function loadFingerprints(strapi: Core.Strapi): Promise<Fingerprint[]> {
  const rows = await strapi.db.query(FINGERPRINT_UID).findMany();
  return rows.map((row: Record<string, unknown>) => ({
    fileId: Number(row.fileId),
    sha256: String(row.sha256 ?? ''),
    phash: String(row.phash ?? ''),
    dhash: String(row.dhash ?? ''),
    byteSize: Number(row.byteSize ?? 0),
  }));
}

export async function ensureFingerprints(strapi: Core.Strapi, files: MediaFile[]): Promise<Fingerprint[]> {
  const existing = await strapi.db.query(FINGERPRINT_UID).findMany();
  const byFile = new Map<number, Record<string, unknown>>(
    existing.map((row: Record<string, unknown>) => [Number(row.fileId), row])
  );

  const livingIds = new Set(files.map((file) => file.id));
  for (const row of existing) {
    if (!livingIds.has(Number(row.fileId))) {
      await strapi.db.query(FINGERPRINT_UID).delete({ where: { id: row.id } });
      byFile.delete(Number(row.fileId));
    }
  }

  const results: Fingerprint[] = [];

  for (const file of files) {
    const cached = byFile.get(file.id);
    if (cached && String(cached.sourceUpdatedAt ?? '') === file.updatedAt && cached.sha256) {
      results.push({
        fileId: file.id,
        sha256: String(cached.sha256),
        phash: String(cached.phash ?? ''),
        dhash: String(cached.dhash ?? ''),
        byteSize: Number(cached.byteSize ?? 0),
      });
      continue;
    }

    try {
      const bytes = await readOriginalBytes(strapi, file);
      const sha256 = await hashFileBytes(bytes);
      const imageHashes = file.mime.startsWith('image/') ? await computeImageHashes(bytes) : null;
      const fingerprint: Fingerprint = {
        fileId: file.id,
        sha256,
        phash: imageHashes?.phash ?? '',
        dhash: imageHashes?.dhash ?? '',
        byteSize: bytes.length,
      };

      const data = {
        fileId: file.id,
        sha256: fingerprint.sha256,
        phash: fingerprint.phash,
        dhash: fingerprint.dhash,
        byteSize: String(fingerprint.byteSize),
        sourceUpdatedAt: file.updatedAt,
      };

      if (cached) {
        await strapi.db.query(FINGERPRINT_UID).update({ where: { id: cached.id }, data });
      } else {
        await strapi.db.query(FINGERPRINT_UID).create({ data });
      }

      results.push(fingerprint);
    } catch (error) {
      strapi.log.warn(`[media-twins] failed to fingerprint file ${file.id}: ${(error as Error).message}`);
    }
  }

  return results;
}

export async function deleteFingerprints(strapi: Core.Strapi, fileIds: number[]) {
  if (fileIds.length === 0) {
    return;
  }
  await strapi.db.query(FINGERPRINT_UID).delete({ where: { fileId: { $in: fileIds } } });
}
