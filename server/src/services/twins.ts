import type { Core } from '@strapi/strapi';

import { deleteFingerprints, ensureFingerprints } from '../adapters/fingerprints';
import { loadFileById, loadFiles, removeFiles } from '../adapters/files';
import { createIgnoreRule, deleteIgnoreRule, loadIgnoreRules } from '../adapters/ignore';
import { applyMorphRewrites, loadMorphRows } from '../adapters/morph';
import { applySoftRewrites, loadTextCells } from '../adapters/soft-refs';
import { PLUGIN_ID } from '../constants';
import { assertDeletable, planDelete } from '../engine/delete';
import { groupExactDuplicates, groupSimilarImages } from '../engine/grouping';
import { findSoftRefs, isFileIgnored, unusedFileIds } from '../engine/orphans';
import { applyReassignInMemory, planReassign, verifyExtrasUnreferenced } from '../engine/reassign';
import {
  DEFAULT_CONFIG,
  StillReferencedError,
  type IgnoreRule,
  type MediaFile,
  type PluginRuntimeConfig,
} from '../engine/types';

type ScanType = 'exact' | 'similar' | 'unused';

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getConfig(): Promise<PluginRuntimeConfig> {
    const fileConfig = strapi.config.get(`plugin::${PLUGIN_ID}`) as Partial<PluginRuntimeConfig> | undefined;
    const store = strapi.store({ type: 'plugin', name: PLUGIN_ID });
    const overlay = ((await store.get({ key: 'config' })) as Partial<PluginRuntimeConfig> | null) ?? {};

    return {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      ...overlay,
    };
  },

  async saveConfig(next: Partial<PluginRuntimeConfig>) {
    const current = await this.getConfig();
    const merged: PluginRuntimeConfig = {
      ...current,
      ...next,
    };

    if (!Number.isInteger(merged.similarityThreshold) || merged.similarityThreshold < 0 || merged.similarityThreshold > 64) {
      throw new Error('similarityThreshold must be an integer between 0 and 64');
    }

    const store = strapi.store({ type: 'plugin', name: PLUGIN_ID });
    await store.set({ key: 'config', value: merged });
    return merged;
  },

  async scan(input: { types?: ScanType[]; deep?: boolean } = {}) {
    const config = await this.getConfig();
    const types = new Set(input.types?.length ? input.types : (['exact', 'similar', 'unused'] as ScanType[]));
    const deep = input.deep ?? config.deepScanDefault;

    const files = await loadFiles(strapi);
    const ignoreRules = await loadIgnoreRules(strapi);
    const visible = files.filter((file) => !isFileIgnored(file, ignoreRules));
    const ignored = files.filter((file) => isFileIgnored(file, ignoreRules));

    const fingerprints = types.has('exact') || types.has('similar') ? await ensureFingerprints(strapi, visible) : [];
    const morphRows = types.has('unused') || types.has('exact') || types.has('similar') ? await loadMorphRows(strapi) : [];
    const cells = deep && types.has('unused') ? await loadTextCells(strapi) : [];

    const exact = types.has('exact') ? groupExactDuplicates(visible, fingerprints) : [];
    const similar = types.has('similar')
      ? groupSimilarImages({
          files: visible,
          fingerprints,
          threshold: config.similarityThreshold,
          skipExact: config.similarSkipExact,
          exactGroups: exact,
        })
      : [];

    const unusedIds = types.has('unused')
      ? unusedFileIds({
          files: visible,
          morphRows,
          softHits: deep ? findSoftRefs(visible, cells) : [],
          ignoreRules,
        })
      : [];

    const resultFiles = collectResultFiles(files, exact, similar, unusedIds, ignored);
    const unusedFiles = unusedIds.map((id) => resultFiles.find((file) => file.id === id)).filter(Boolean) as MediaFile[];

    return {
      scannedAt: new Date().toISOString(),
      config,
      files: resultFiles,
      exact,
      similar,
      unused: {
        fileIds: unusedIds,
        reclaimableKb: unusedFiles.reduce((sum, file) => sum + Number(file.size || 0), 0),
      },
      ignored: {
        fileIds: ignored.map((file) => file.id),
        rules: ignoreRules,
      },
      stats: {
        fileCount: files.length,
        imageCount: files.filter((file) => file.mime.startsWith('image/')).length,
        unusedCount: unusedIds.length,
        exactGroupCount: exact.length,
        similarGroupCount: similar.length,
        libraryKb: files.reduce((sum, file) => sum + Number(file.size || 0), 0),
      },
    };
  },

  async previewReassign(canonicalId: number, extraIds: number[]) {
    const { canonical, extras, morphRows, cells } = await this.loadReassignContext(canonicalId, extraIds);
    return planReassign({ canonical, extras, morphRows, cells });
  },

  async applyReassign(canonicalId: number, extraIds: number[]) {
    const { canonical, extras, morphRows, cells } = await this.loadReassignContext(canonicalId, extraIds);
    const plan = planReassign({ canonical, extras, morphRows, cells });

    await applyMorphRewrites(strapi, plan.morphUpdates);
    await applySoftRewrites(strapi, cells, extras, canonical);

    const nextMorph = (await loadMorphRows(strapi)).filter((row) => extraIds.includes(row.fileId) || row.fileId === canonicalId);
    const nextCells = await loadTextCells(strapi);
    const blocked = verifyExtrasUnreferenced({
      extraIds,
      morphRows: nextMorph,
      cells: nextCells,
      extras,
    });

    if (blocked.length > 0) {
      return {
        rewritten: true,
        deleted: false,
        plan,
        blocked,
      };
    }

    await removeFiles(strapi, extraIds);
    await deleteFingerprints(strapi, extraIds);

    return {
      rewritten: true,
      deleted: true,
      plan,
      blocked: [],
    };
  },

  async previewDelete(fileIds: number[]) {
    const files = await loadSelectedFiles(strapi, fileIds);
    const morphRows = await loadMorphRows(strapi);
    const cells = await loadTextCells(strapi);
    return planDelete({ fileIds, files, morphRows, cells });
  },

  async applyDelete(fileIds: number[]) {
    const plan = await this.previewDelete(fileIds);
    assertDeletable(plan);
    await removeFiles(strapi, fileIds);
    await deleteFingerprints(strapi, fileIds);
    return { deleted: fileIds, plan };
  },

  async listIgnore() {
    return loadIgnoreRules(strapi);
  },

  async addIgnore(rule: Omit<IgnoreRule, 'id'>) {
    return createIgnoreRule(strapi, rule);
  },

  async removeIgnore(id: number) {
    await deleteIgnoreRule(strapi, id);
  },

  async loadReassignContext(canonicalId: number, extraIds: number[]) {
    if (!canonicalId || extraIds.length === 0) {
      throw new Error('canonicalId and extraIds are required');
    }
    if (extraIds.includes(canonicalId)) {
      throw new Error('canonicalId cannot be included in extraIds');
    }

    const canonical = await loadFileById(strapi, canonicalId);
    if (!canonical) {
      throw new Error(`Canonical file ${canonicalId} was not found`);
    }

    const extras: MediaFile[] = [];
    for (const id of extraIds) {
      const file = await loadFileById(strapi, id);
      if (!file) {
        throw new Error(`Extra file ${id} was not found`);
      }
      extras.push(file);
    }

    const morphRows = await loadMorphRows(strapi);
    const cells = await loadTextCells(strapi);

    return { canonical, extras, morphRows, cells };
  },
});

async function loadSelectedFiles(strapi: Core.Strapi, fileIds: number[]): Promise<MediaFile[]> {
  const files: MediaFile[] = [];
  for (const id of fileIds) {
    const file = await loadFileById(strapi, id);
    if (file) {
      files.push(file);
    }
  }
  return files;
}

function collectResultFiles(
  files: MediaFile[],
  exact: { fileIds: number[] }[],
  similar: { fileIds: number[] }[],
  unusedIds: number[],
  ignored: MediaFile[]
): MediaFile[] {
  const ids = new Set<number>([...unusedIds, ...ignored.map((file) => file.id)]);
  for (const group of [...exact, ...similar]) {
    for (const id of group.fileIds) {
      ids.add(id);
    }
  }
  return files.filter((file) => ids.has(file.id));
}

export default service;
export { StillReferencedError, applyReassignInMemory };
