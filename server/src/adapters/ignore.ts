import type { Core } from '@strapi/strapi';

import { IGNORE_UID } from '../constants';
import type { IgnoreRule } from '../engine/types';

export async function loadIgnoreRules(strapi: Core.Strapi): Promise<IgnoreRule[]> {
  const rows = await strapi.db.query(IGNORE_UID).findMany({ orderBy: { id: 'asc' } });
  return rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    kind: row.kind === 'folder' ? 'folder' : 'file',
    fileId: row.fileId == null ? null : Number(row.fileId),
    folderId: row.folderId == null ? null : Number(row.folderId),
    folderPath: (row.folderPath as string | null) ?? null,
    label: (row.label as string | null) ?? null,
  }));
}

export async function createIgnoreRule(strapi: Core.Strapi, rule: Omit<IgnoreRule, 'id'>): Promise<IgnoreRule> {
  const created = await strapi.db.query(IGNORE_UID).create({
    data: {
      kind: rule.kind,
      fileId: rule.fileId ?? null,
      folderId: rule.folderId ?? null,
      folderPath: rule.folderPath ?? null,
      label: rule.label ?? null,
    },
  });

  return {
    id: Number(created.id),
    kind: created.kind,
    fileId: created.fileId ?? null,
    folderId: created.folderId ?? null,
    folderPath: created.folderPath ?? null,
    label: created.label ?? null,
  };
}

export async function deleteIgnoreRule(strapi: Core.Strapi, id: number) {
  await strapi.db.query(IGNORE_UID).delete({ where: { id } });
}
