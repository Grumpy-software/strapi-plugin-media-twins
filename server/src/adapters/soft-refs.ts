import type { Core } from '@strapi/strapi';

import type { TextCell } from '../engine/orphans';
import { rewriteCellValue } from '../engine/rewrite';
import type { MediaFile } from '../engine/types';

const SKIP_UID_PREFIXES = [
  'admin::',
  'plugin::i18n',
  'plugin::users-permissions',
  'plugin::media-twins',
  'plugin::upload',
  'plugin::content-releases',
  'plugin::review-workflows',
];

const TEXT_TYPES = new Set(['string', 'text', 'richtext', 'blocks', 'json']);

interface ColumnTarget {
  uid: string;
  tableName: string;
  field: string;
  type: string;
}

export function discoverTextColumns(strapi: Core.Strapi): ColumnTarget[] {
  const targets: ColumnTarget[] = [];
  const schemas = {
    ...strapi.contentTypes,
    ...strapi.components,
  };

  for (const [uid, schema] of Object.entries(schemas)) {
    if (SKIP_UID_PREFIXES.some((prefix) => uid.startsWith(prefix))) {
      continue;
    }

    const tableName = (strapi.db.metadata.get(uid) as { tableName?: string } | undefined)?.tableName;
    if (!tableName) {
      continue;
    }

    const attributes = (schema as { attributes?: Record<string, { type?: string }> }).attributes ?? {};
    for (const [field, attribute] of Object.entries(attributes)) {
      if (attribute?.type && TEXT_TYPES.has(attribute.type)) {
        targets.push({ uid, tableName, field, type: attribute.type });
      }
    }
  }

  return targets;
}

export async function loadTextCells(strapi: Core.Strapi): Promise<TextCell[]> {
  const knex = strapi.db.connection;
  const cells: TextCell[] = [];

  for (const target of discoverTextColumns(strapi)) {
    if (!(await knex.schema.hasTable(target.tableName))) {
      continue;
    }

    const columns = await knex(target.tableName).columnInfo();
    if (!columns.id || !columns[target.field]) {
      continue;
    }

    const rows = await knex(target.tableName).select('id', target.field).whereNotNull(target.field);
    for (const row of rows) {
      const value = row[target.field];
      if (value == null || value === '') {
        continue;
      }
      cells.push({
        relatedType: target.uid,
        relatedId: Number(row.id),
        field: target.field,
        value,
      });
    }
  }

  return cells;
}

export async function applySoftRewrites(
  strapi: Core.Strapi,
  cells: TextCell[],
  extras: MediaFile[],
  canonical: MediaFile
) {
  const knex = strapi.db.connection;
  const tableByUid = new Map<string, string>();

  for (const cell of cells) {
    const rewritten = rewriteCellValue(cell.value, extras, canonical);
    if (rewritten.replacements === 0) {
      continue;
    }

    let tableName = tableByUid.get(cell.relatedType);
    if (!tableName) {
      tableName = (strapi.db.metadata.get(cell.relatedType) as { tableName?: string } | undefined)?.tableName;
      if (!tableName) {
        continue;
      }
      tableByUid.set(cell.relatedType, tableName);
    }

    const nextValue = persistableValue(rewritten.value, cell.value);
    await knex(tableName).where({ id: cell.relatedId }).update({ [cell.field]: nextValue });
  }
}

function persistableValue(next: unknown, previous: unknown): unknown {
  if (typeof previous === 'string' && typeof next !== 'string') {
    return JSON.stringify(next);
  }
  if (typeof next !== 'string' && looksLikeJsonColumn(previous)) {
    return next;
  }
  return next;
}

function looksLikeJsonColumn(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object';
}
