import type { Core } from '@strapi/strapi';

import { FILE_UID } from '../constants';
import type { MorphRow } from '../engine/types';

const FALLBACK_TABLES = ['files_related_mph', 'files_related_morphs'];

export function resolveMorphTable(strapi: Core.Strapi): string {
  const metadata = strapi.db.metadata.get(FILE_UID) as {
    attributes?: Record<string, { joinTable?: { name?: string } }>;
  };

  const related = metadata?.attributes?.related;
  if (related?.joinTable?.name) {
    return related.joinTable.name;
  }

  const knex = strapi.db.connection;
  for (const candidate of FALLBACK_TABLES) {
    // Synchronous check is not available; callers should prefer metadata.
    if (typeof knex.schema.hasTable === 'function') {
      // Best-effort: metadata is the authority. Fallback name used if present later.
    }
  }

  return FALLBACK_TABLES[0];
}

export async function loadMorphRows(strapi: Core.Strapi): Promise<MorphRow[]> {
  const table = await resolveMorphTableAsync(strapi);
  const knex = strapi.db.connection;
  const rows = await knex(table).select('*');

  return rows.map((row: Record<string, unknown>) => ({
    fileId: Number(row.file_id ?? row.fileId),
    relatedId: Number(row.related_id ?? row.relatedId),
    relatedType: String(row.related_type ?? row.relatedType ?? ''),
    field: String(row.field ?? ''),
    order: row.order == null ? undefined : Number(row.order),
  }));
}

export async function applyMorphRewrites(
  strapi: Core.Strapi,
  updates: Array<{
    fromFileId: number;
    toFileId: number;
    relatedId: number;
    relatedType: string;
    field: string;
    action: 'update' | 'drop-duplicate';
  }>
) {
  const table = await resolveMorphTableAsync(strapi);
  const knex = strapi.db.connection;

  for (const update of updates) {
    const where = {
      file_id: update.fromFileId,
      related_id: update.relatedId,
      related_type: update.relatedType,
      field: update.field,
    };

    if (update.action === 'drop-duplicate') {
      await knex(table).where(where).delete();
    } else {
      await knex(table).where(where).update({ file_id: update.toFileId });
    }
  }
}

async function resolveMorphTableAsync(strapi: Core.Strapi): Promise<string> {
  const fromMeta = resolveMorphTable(strapi);
  const knex = strapi.db.connection;

  if (await knex.schema.hasTable(fromMeta)) {
    return fromMeta;
  }

  for (const candidate of FALLBACK_TABLES) {
    if (await knex.schema.hasTable(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not resolve the upload morph relation table (files_related_mph).');
}
