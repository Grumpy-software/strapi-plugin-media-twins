export interface MediaFile {
  id: number;
  documentId?: string;
  name: string;
  hash: string;
  url: string;
  ext?: string | null;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  formats?: Record<string, MediaFormat> | null;
  folderPath: string;
  updatedAt: string;
  alternativeText?: string | null;
  caption?: string | null;
  provider?: string | null;
}

export interface MediaFormat {
  hash?: string;
  url?: string;
  ext?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  name?: string;
}

export interface Fingerprint {
  fileId: number;
  sha256: string;
  phash: string;
  dhash: string;
  byteSize: number;
}

export interface MorphRow {
  fileId: number;
  relatedId: number;
  relatedType: string;
  field: string;
  order?: number;
}

export interface SoftRefHit {
  fileId: number;
  relatedType: string;
  relatedId: number;
  field: string;
  token: string;
}

export type GroupKind = 'exact' | 'similar';

export interface FileGroup {
  kind: GroupKind;
  id: string;
  canonicalId: number;
  fileIds: number[];
  extraIds: number[];
  reason: string;
}

export interface MorphRewrite {
  fromFileId: number;
  toFileId: number;
  relatedId: number;
  relatedType: string;
  field: string;
  action: 'update' | 'drop-duplicate';
}

export interface SoftRewrite {
  relatedType: string;
  relatedId: number;
  field: string;
  replacements: number;
}

export interface ReassignPlan {
  canonicalId: number;
  extraIds: number[];
  morphUpdates: MorphRewrite[];
  softRewrites: SoftRewrite[];
  filesToDelete: number[];
}

export interface ReferenceReason {
  fileId: number;
  reasons: string[];
}

export interface DeletePlan {
  fileIds: number[];
  blocked: ReferenceReason[];
}

export interface IgnoreRule {
  id?: number;
  kind: 'file' | 'folder';
  fileId?: number | null;
  folderId?: number | null;
  folderPath?: string | null;
  label?: string | null;
}

export interface PluginRuntimeConfig {
  similarityThreshold: number;
  similarSkipExact: boolean;
  deepScanDefault: boolean;
}

export const DEFAULT_CONFIG: PluginRuntimeConfig = {
  similarityThreshold: 10,
  similarSkipExact: true,
  deepScanDefault: true,
};

export class StillReferencedError extends Error {
  readonly code = 'STILL_REFERENCED';
  readonly files: ReferenceReason[];

  constructor(files: ReferenceReason[]) {
    super('One or more files are still referenced and will not be deleted.');
    this.name = 'StillReferencedError';
    this.files = files;
  }
}
