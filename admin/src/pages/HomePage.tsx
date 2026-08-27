import { Alert, Box, Button, Checkbox, Flex, Loader, Typography } from '@strapi/design-system';
import { Page, useFetchClient, useNotification, useRBAC } from '@strapi/strapi/admin';
import { useMemo, useState, type CSSProperties } from 'react';
import { useIntl } from 'react-intl';

import type { DeletePlan, FileGroup, MediaFile, ReassignPlan, ScanResult } from '../api/types';
import { FileCard } from '../components/FileCard';
import pluginPermissions from '../permissions';
import { getTranslation } from '../utils/getTranslation';

type TabKey = 'exact' | 'similar' | 'unused';

const HomePage = () => {
  const { formatMessage } = useIntl();
  const { post } = useFetchClient();
  const { toggleNotification } = useSafeNotification();
  const { allowedActions } = useRBAC({
    see: pluginPermissions.see,
    configure: pluginPermissions.configure,
    reassign: pluginPermissions.reassign,
    delete: pluginPermissions.delete,
  });

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('exact');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showIgnored, setShowIgnored] = useState(false);
  const [query, setQuery] = useState('');
  const [canonicalByGroup, setCanonicalByGroup] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);

  const filesById = useMemo(() => {
    const map = new Map<number, MediaFile>();
    for (const file of scan?.files ?? []) {
      map.set(file.id, file);
    }
    return map;
  }, [scan]);

  const ignoredIds = useMemo(() => new Set(scan?.ignored.fileIds ?? []), [scan]);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await post('/media-twins/scan', { types: ['exact', 'similar', 'unused'], deep: true });
      const data = unwrap<ScanResult>(response);
      setScan(data);
      setCanonicalByGroup(defaultCanonicals(data));
      setSelected({});
    } catch (err) {
      setError(asMessage(err, 'Scan failed.'));
    } finally {
      setLoading(false);
    }
  };

  const currentGroups = tab === 'unused' ? [] : scan?.[tab] ?? [];
  const unusedFiles = (scan?.unused.fileIds ?? [])
    .map((id) => filesById.get(id))
    .filter((file): file is MediaFile => Boolean(file))
    .filter((file) => matchesQuery(file, query))
    .filter((file) => showIgnored || !ignoredIds.has(file.id));

  const visibleGroups = currentGroups
    .map((group) => ({
      ...group,
      fileIds: group.fileIds.filter((id) => {
        const file = filesById.get(id);
        return file && matchesQuery(file, query) && (showIgnored || !ignoredIds.has(id));
      }),
    }))
    .filter((group) => group.fileIds.length > 0);

  const selectedIds = Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => Number(id));

  const openReassignPreview = async () => {
    const target = visibleGroups.find((group) => group.fileIds.some((id) => selected[id]));
    const group = target ?? visibleGroups[0];
    if (!group) {
      return;
    }
    const canonicalId = canonicalByGroup[group.id] ?? group.canonicalId;
    const extraIds = group.fileIds.filter((id) => id !== canonicalId);
    setBusy(true);
    try {
      const response = await post('/media-twins/reassign/preview', { canonicalId, extraIds });
      setPreview({ kind: 'reassign', canonicalId, extraIds, plan: unwrap<ReassignPlan>(response) });
    } catch (err) {
      setError(asMessage(err, 'Could not preview reassign.'));
    } finally {
      setBusy(false);
    }
  };

  const applyReassign = async () => {
    if (!preview || preview.kind !== 'reassign') {
      return;
    }
    setBusy(true);
    try {
      const response = await post('/media-twins/reassign', {
        canonicalId: preview.canonicalId,
        extraIds: preview.extraIds,
      });
      const result = unwrap<{ deleted: boolean; blocked?: unknown[] }>(response);
      setPreview(null);
      toggleNotification({
        type: result.deleted ? 'success' : 'warning',
        message: result.deleted
          ? 'References now point at the canonical file. Extra files were deleted.'
          : 'References were rewritten, but extras were not deleted because a verify step still found references.',
      });
      await runScan();
    } catch (err) {
      setError(asMessage(err, 'Reassign failed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDeletePreview = async (fileIds: number[]) => {
    if (fileIds.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const response = await post('/media-twins/delete/preview', { fileIds });
      setPreview({ kind: 'delete', fileIds, plan: unwrap<DeletePlan>(response) });
    } catch (err) {
      setError(asMessage(err, 'Could not preview delete.'));
    } finally {
      setBusy(false);
    }
  };

  const applyDelete = async () => {
    if (!preview || preview.kind !== 'delete') {
      return;
    }
    if (preview.plan.blocked.length > 0) {
      setError(formatMessage({ id: getTranslation('error.stillReferenced'), defaultMessage: 'Delete refused: one or more files are still referenced.' }));
      return;
    }
    setBusy(true);
    try {
      await post('/media-twins/delete', { fileIds: preview.fileIds });
      setPreview(null);
      toggleNotification({ type: 'success', message: 'Selected files were deleted.' });
      await runScan();
    } catch (err) {
      setError(asMessage(err, 'Delete refused.'));
    } finally {
      setBusy(false);
    }
  };

  const ignoreSelected = async () => {
    for (const id of selectedIds) {
      const file = filesById.get(id);
      if (!file) continue;
      await post('/media-twins/ignore', { kind: 'file', fileId: file.id, label: file.name });
    }
    await runScan();
  };

  return (
    <Page.Protect permissions={pluginPermissions.see}>
      <Page.Main>
        <Box padding={8}>
          <Flex justifyContent="space-between" alignItems="flex-start" wrap="wrap" gap={4}>
            <Box>
              <Typography variant="alpha" as="h1">
                {formatMessage({ id: getTranslation('header.title'), defaultMessage: 'Media Twins' })}
              </Typography>
              <Typography variant="epsilon" textColor="neutral600">
                {scan
                  ? `${scan.stats.fileCount} files in the library · ${Math.round(scan.unused.reclaimableKb)} KB reclaimable from unused files`
                  : 'Scan the Media Library for exact duplicates, similar images, and unused files.'}
              </Typography>
            </Box>
            <Button onClick={runScan} loading={loading} disabled={!allowedActions.canSee}>
              {formatMessage({ id: getTranslation('actions.scan'), defaultMessage: 'Scan' })}
            </Button>
          </Flex>

          <Box paddingTop={6}>
            <Flex gap={2} wrap="wrap">
              <TabButton active={tab === 'exact'} onClick={() => setTab('exact')} label={`Exact duplicates${countLabel(scan?.exact.length)}`} />
              <TabButton active={tab === 'similar'} onClick={() => setTab('similar')} label={`Similar images${countLabel(scan?.similar.length)}`} />
              <TabButton active={tab === 'unused'} onClick={() => setTab('unused')} label={`Unused${countLabel(scan?.unused.fileIds.length)}`} />
            </Flex>
          </Box>

          <Box paddingTop={4}>
            <Flex justifyContent="space-between" wrap="wrap" gap={3}>
              <Flex gap={3} wrap="wrap" alignItems="center">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by filename"
                  style={searchStyle}
                />
                <Button variant={layout === 'grid' ? 'secondary' : 'tertiary'} onClick={() => setLayout('grid')}>
                  Grid
                </Button>
                <Button variant={layout === 'list' ? 'secondary' : 'tertiary'} onClick={() => setLayout('list')}>
                  List
                </Button>
                <Flex gap={2} alignItems="center">
                  <Checkbox checked={showIgnored} onCheckedChange={() => setShowIgnored((value) => !value)} />
                  <Typography variant="pi">Show ignored</Typography>
                </Flex>
              </Flex>
              <Flex gap={2} wrap="wrap">
                {tab !== 'unused' && allowedActions.canReassign ? (
                  <Button variant="secondary" onClick={openReassignPreview} disabled={visibleGroups.length === 0 || busy}>
                    Preview reassign
                  </Button>
                ) : null}
                {tab === 'unused' && allowedActions.canDelete ? (
                  <Button variant="danger-light" onClick={() => openDeletePreview(selectedIds)} disabled={selectedIds.length === 0 || busy}>
                    Preview delete
                  </Button>
                ) : null}
                {allowedActions.canConfigure ? (
                  <Button variant="tertiary" onClick={ignoreSelected} disabled={selectedIds.length === 0 || busy}>
                    Ignore
                  </Button>
                ) : null}
              </Flex>
            </Flex>
          </Box>

          {error ? (
            <Box paddingTop={4}>
              <Alert closeLabel="Close" variant="danger" onClose={() => setError(null)}>
                {error}
              </Alert>
            </Box>
          ) : null}

          <Box paddingTop={6}>
            {loading ? (
              <Flex justifyContent="center" padding={8} gap={3} direction="column" alignItems="center">
                <Loader />
                <Typography textColor="neutral600">Scanning media…</Typography>
              </Flex>
            ) : !scan ? (
              <EmptyState title="No scan yet" text="Run a scan to group exact duplicates, similar images, and unused files." />
            ) : tab === 'unused' ? (
              unusedFiles.length === 0 ? (
                <EmptyState title="No unused files." text="Every Media Library file is referenced by a relation or a rich-text / Blocks soft reference." />
              ) : (
                <FileGrid
                  files={unusedFiles}
                  layout={layout}
                  selected={selected}
                  ignoredIds={ignoredIds}
                  onToggle={(id) => setSelected((current) => ({ ...current, [id]: !current[id] }))}
                />
              )
            ) : visibleGroups.length === 0 ? (
              <EmptyState
                title={tab === 'exact' ? 'No exact duplicates in this library.' : 'No similar images at this threshold.'}
                text={tab === 'similar' ? `Current Hamming threshold: ${scan.config.similarityThreshold}. Video similarity is out of v1.` : 'SHA-256 matched no byte-identical copies.'}
              />
            ) : (
              <Flex direction="column" gap={6}>
                {visibleGroups.map((group) => (
                  <GroupBlock
                    key={group.id}
                    group={group}
                    filesById={filesById}
                    layout={layout}
                    canonicalId={canonicalByGroup[group.id] ?? group.canonicalId}
                    selected={selected}
                    ignoredIds={ignoredIds}
                    onCanonical={(id) => setCanonicalByGroup((current) => ({ ...current, [group.id]: id }))}
                    onToggle={(id) => setSelected((current) => ({ ...current, [id]: !current[id] }))}
                  />
                ))}
              </Flex>
            )}
          </Box>
        </Box>

        {preview ? (
          <PreviewPanel
            preview={preview}
            filesById={filesById}
            busy={busy}
            onClose={() => setPreview(null)}
            onApply={preview.kind === 'reassign' ? applyReassign : applyDelete}
          />
        ) : null}
      </Page.Main>
    </Page.Protect>
  );
};

type PreviewState =
  | { kind: 'reassign'; canonicalId: number; extraIds: number[]; plan: ReassignPlan }
  | { kind: 'delete'; fileIds: number[]; plan: DeletePlan };

const GroupBlock = ({
  group,
  filesById,
  layout,
  canonicalId,
  selected,
  ignoredIds,
  onCanonical,
  onToggle,
}: {
  group: FileGroup;
  filesById: Map<number, MediaFile>;
  layout: 'grid' | 'list';
  canonicalId: number;
  selected: Record<number, boolean>;
  ignoredIds: Set<number>;
  onCanonical: (id: number) => void;
  onToggle: (id: number) => void;
}) => {
  const files = group.fileIds.map((id) => filesById.get(id)).filter((file): file is MediaFile => Boolean(file));

  return (
    <Box background="neutral100" hasRadius padding={4}>
      <Flex justifyContent="space-between" paddingBottom={4} wrap="wrap" gap={2}>
        <Typography fontWeight="bold">
          {group.kind === 'exact' ? 'Exact group' : 'Similar group'} · {files.length} files
        </Typography>
        <Typography variant="pi" textColor="neutral600">
          {group.reason}
        </Typography>
      </Flex>
      <FileGrid
        files={files}
        layout={layout}
        selected={selected}
        ignoredIds={ignoredIds}
        canonicalId={canonicalId}
        onCanonical={onCanonical}
        onToggle={onToggle}
      />
    </Box>
  );
};

const FileGrid = ({
  files,
  layout,
  selected,
  ignoredIds,
  canonicalId,
  onCanonical,
  onToggle,
}: {
  files: MediaFile[];
  layout: 'grid' | 'list';
  selected: Record<number, boolean>;
  ignoredIds: Set<number>;
  canonicalId?: number;
  onCanonical?: (id: number) => void;
  onToggle: (id: number) => void;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: layout === 'grid' ? 'repeat(auto-fill, minmax(220px, 1fr))' : '1fr',
      gap: 16,
    }}
  >
    {files.map((file) => (
      <FileCard
        key={file.id}
        file={file}
        layout={layout}
        selected={Boolean(selected[file.id])}
        canonical={canonicalId === file.id}
        disabled={ignoredIds.has(file.id)}
        onToggle={() => onToggle(file.id)}
        onCanonical={onCanonical && canonicalId !== file.id ? () => onCanonical(file.id) : undefined}
      />
    ))}
  </div>
);

const PreviewPanel = ({
  preview,
  filesById,
  busy,
  onClose,
  onApply,
}: {
  preview: PreviewState;
  filesById: Map<number, MediaFile>;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
}) => {
  const blocked = preview.kind === 'delete' ? preview.plan.blocked : [];

  return (
    <Box
      background="neutral0"
      borderColor="neutral200"
      padding={6}
      style={{ position: 'sticky', bottom: 0, borderTop: '1px solid #dcdce4' }}
    >
      <Typography variant="delta" as="h2">
        Preview changes
      </Typography>
      <Box paddingTop={3}>
        {preview.kind === 'reassign' ? (
          <Typography>
            Canonical file {fileName(filesById, preview.canonicalId)}. {preview.plan.morphUpdates.length} morph
            relation(s) and {preview.plan.softRewrites.length} rich-text / Blocks field(s) will be rewritten. Then{' '}
            {preview.extraIds.length} extra file(s) will be deleted if the verify step finds no remaining references.
          </Typography>
        ) : (
          <Typography>
            {preview.fileIds.length} file(s) selected for deletion.
            {blocked.length > 0
              ? ` ${blocked.length} still referenced — apply will be refused.`
              : ' A pre-delete scan found no references.'}
          </Typography>
        )}
      </Box>
      <Flex paddingTop={4} gap={2}>
        <Button onClick={onApply} loading={busy} disabled={blocked.length > 0} variant={preview.kind === 'delete' ? 'danger' : 'default'}>
          Apply
        </Button>
        <Button variant="tertiary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </Flex>
    </Box>
  );
};

const TabButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <Button variant={active ? 'secondary' : 'tertiary'} onClick={onClick}>
    {label}
  </Button>
);

const EmptyState = ({ title, text }: { title: string; text: string }) => (
  <Box background="neutral100" hasRadius padding={8}>
    <Typography variant="delta">{title}</Typography>
    <Box paddingTop={2}>
      <Typography textColor="neutral600">{text}</Typography>
    </Box>
  </Box>
);

function defaultCanonicals(data: ScanResult) {
  const map: Record<string, number> = {};
  for (const group of [...data.exact, ...data.similar]) {
    map[group.id] = group.canonicalId;
  }
  return map;
}

function matchesQuery(file: MediaFile, query: string) {
  if (!query.trim()) {
    return true;
  }
  return file.name.toLowerCase().includes(query.trim().toLowerCase());
}

function countLabel(count?: number) {
  return typeof count === 'number' ? ` (${count})` : '';
}

function unwrap<T>(response: unknown): T {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}

function asMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data;
  return response?.error?.message || response?.message || fallback;
}

function fileName(filesById: Map<number, MediaFile>, id: number) {
  return filesById.get(id)?.name ?? `#${id}`;
}

function useSafeNotification() {
  try {
    return useNotification();
  } catch {
    return { toggleNotification: () => undefined };
  }
}

const searchStyle: CSSProperties = {
  height: 40,
  border: '1px solid #dcdce4',
  borderRadius: 4,
  padding: '0 12px',
  minWidth: 220,
};

export { HomePage };
