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
  formats?: Record<string, { url?: string; hash?: string }> | null;
  folderPath: string;
  updatedAt: string;
  alternativeText?: string | null;
}

export interface FileGroup {
  kind: 'exact' | 'similar';
  id: string;
  canonicalId: number;
  fileIds: number[];
  extraIds: number[];
  reason: string;
}

export interface ScanResult {
  scannedAt: string;
  config: {
    similarityThreshold: number;
    similarSkipExact: boolean;
    deepScanDefault: boolean;
  };
  files: MediaFile[];
  exact: FileGroup[];
  similar: FileGroup[];
  unused: { fileIds: number[]; reclaimableKb: number };
  ignored: { fileIds: number[]; rules: IgnoreRule[] };
  stats: {
    fileCount: number;
    imageCount: number;
    unusedCount: number;
    exactGroupCount: number;
    similarGroupCount: number;
    libraryKb: number;
  };
}

export interface IgnoreRule {
  id?: number;
  kind: 'file' | 'folder';
  fileId?: number | null;
  folderId?: number | null;
  folderPath?: string | null;
  label?: string | null;
}

export interface ReassignPlan {
  canonicalId: number;
  extraIds: number[];
  morphUpdates: Array<{ action: string; relatedType: string; relatedId: number; field: string }>;
  softRewrites: Array<{ relatedType: string; relatedId: number; field: string; replacements: number }>;
  filesToDelete: number[];
}

export interface DeletePlan {
  fileIds: number[];
  blocked: Array<{ fileId: number; reasons: string[] }>;
}
