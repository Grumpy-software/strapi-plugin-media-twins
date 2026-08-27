import { Alert, Badge, Box, Button, Checkbox, Flex, Loader, TextButton, Typography } from '@strapi/design-system';
import { ArrowClockwise, Duplicate, GridFour, Images, List, Search, Trash } from '@strapi/icons';
import { Page, useFetchClient, useNotification, useRBAC } from '@strapi/strapi/admin';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import styled from 'styled-components';

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

  const reclaimable = scan ? formatKb(scan.unused.reclaimableKb) : null;

  return (
    <Page.Protect permissions={pluginPermissions.see}>
      <Page.Main>
        <PageWrap>
          <Box paddingLeft={10} paddingRight={10} paddingTop={8} paddingBottom={preview ? 24 : 8}>
            {/* ------------------------------ Header ------------------------------ */}
            <Flex justifyContent="space-between" alignItems="flex-start" wrap="wrap" gap={4} width="100%">
              <Box>
                <Typography variant="beta" tag="h1">
                  {formatMessage({ id: getTranslation('header.title'), defaultMessage: 'Media Twins' })}
                </Typography>
                <Box paddingTop={1}>
                  <Typography variant="epsilon" textColor="neutral600">
                    {scan
                      ? 'Review the groups below, pick a canonical file per group, then reassign or delete.'
                      : 'Scan the Media Library for exact duplicates, similar images, and unused files.'}
                  </Typography>
                </Box>
              </Box>
              <Button onClick={runScan} loading={loading} disabled={!allowedActions.canSee} startIcon={scan ? <ArrowClockwise /> : undefined} size="L">
                {formatMessage(
                  scan
                    ? { id: getTranslation('actions.rescan'), defaultMessage: 'Scan again' }
                    : { id: getTranslation('actions.scan'), defaultMessage: 'Scan' }
                )}
              </Button>
            </Flex>

            {/* ---------------------------- Stat strip ---------------------------- */}
            {scan ? (
              <StatStrip>
                <Stat value={String(scan.stats.fileCount)} label="files in library" />
                <StatDivider />
                <Stat value={String(scan.exact.length)} label="exact groups" />
                <StatDivider />
                <Stat value={String(scan.similar.length)} label="similar groups" />
                <StatDivider />
                <Stat value={String(scan.unused.fileIds.length)} label="unused files" />
                <StatDivider />
                <Stat value={reclaimable ?? '0 KB'} label="reclaimable" accent />
              </StatStrip>
            ) : null}

            {/* ------------------------------- Tabs ------------------------------- */}
            <TabsBar role="tablist">
              <TabItem role="tab" aria-selected={tab === 'exact'} $active={tab === 'exact'} onClick={() => setTab('exact')}>
                Exact duplicates
                {scan ? <Badge active={tab === 'exact'}>{scan.exact.length}</Badge> : null}
              </TabItem>
              <TabItem role="tab" aria-selected={tab === 'similar'} $active={tab === 'similar'} onClick={() => setTab('similar')}>
                Similar images
                {scan ? <Badge active={tab === 'similar'}>{scan.similar.length}</Badge> : null}
              </TabItem>
              <TabItem role="tab" aria-selected={tab === 'unused'} $active={tab === 'unused'} onClick={() => setTab('unused')}>
                Unused
                {scan ? <Badge active={tab === 'unused'}>{scan.unused.fileIds.length}</Badge> : null}
              </TabItem>
            </TabsBar>

            {/* ------------------------------ Toolbar ------------------------------ */}
            <Toolbar>
              <Flex gap={3} alignItems="center" wrap="wrap">
                <SearchBox>
                  <Search aria-hidden width={12} height={12} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by filename" aria-label="Search by filename" />
                </SearchBox>
                <Segmented>
                  <SegmentButton type="button" aria-label="Grid" title="Grid" $active={layout === 'grid'} onClick={() => setLayout('grid')}>
                    <GridFour width={14} height={14} />
                  </SegmentButton>
                  <SegmentButton type="button" aria-label="List" title="List" $active={layout === 'list'} onClick={() => setLayout('list')}>
                    <List width={14} height={14} />
                  </SegmentButton>
                </Segmented>
                <Flex gap={2} alignItems="center">
                  <Checkbox checked={showIgnored} onCheckedChange={() => setShowIgnored((value) => !value)} aria-label="Show ignored" />
                  <Typography variant="pi" textColor="neutral600">
                    Show ignored
                  </Typography>
                </Flex>
              </Flex>
              <Flex gap={3} alignItems="center" wrap="wrap">
                {selectedIds.length > 0 ? (
                  <>
                    <Typography variant="pi" textColor="neutral600">
                      {selectedIds.length} selected
                    </Typography>
                    <TextButton onClick={() => setSelected({})}>Clear</TextButton>
                  </>
                ) : null}
                {tab !== 'unused' && allowedActions.canReassign ? (
                  <Button variant="secondary" startIcon={<Duplicate />} onClick={openReassignPreview} disabled={visibleGroups.length === 0 || busy}>
                    Preview reassign
                  </Button>
                ) : null}
                {tab === 'unused' && allowedActions.canDelete ? (
                  <Button variant="danger-light" startIcon={<Trash />} onClick={() => openDeletePreview(selectedIds)} disabled={selectedIds.length === 0 || busy}>
                    Preview delete
                  </Button>
                ) : null}
                {allowedActions.canConfigure ? (
                  <Button variant="tertiary" onClick={ignoreSelected} disabled={selectedIds.length === 0 || busy}>
                    Ignore
                  </Button>
                ) : null}
              </Flex>
            </Toolbar>

            {error ? (
              <Box paddingTop={4} width="100%">
                <Alert closeLabel="Close" variant="danger" onClose={() => setError(null)}>
                  {error}
                </Alert>
              </Box>
            ) : null}

            {/* ------------------------------ Results ------------------------------ */}
            <Box paddingTop={5} width="100%">
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
                  <UnusedPanel $list={layout === 'list'}>
                    <FileGrid
                      files={unusedFiles}
                      layout={layout}
                      selected={selected}
                      ignoredIds={ignoredIds}
                      onToggle={(id) => setSelected((current) => ({ ...current, [id]: !current[id] }))}
                    />
                  </UnusedPanel>
                )
              ) : visibleGroups.length === 0 ? (
                <EmptyState
                  title={tab === 'exact' ? 'No exact duplicates in this library.' : 'No similar images at this threshold.'}
                  text={tab === 'similar' ? `Current Hamming threshold: ${scan.config.similarityThreshold}. Video similarity is out of v1.` : 'SHA-256 matched no byte-identical copies.'}
                />
              ) : (
                <GroupStack>
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
                </GroupStack>
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
        </PageWrap>
      </Page.Main>
    </Page.Protect>
  );
};

type PreviewState =
  | { kind: 'reassign'; canonicalId: number; extraIds: number[]; plan: ReassignPlan }
  | { kind: 'delete'; fileIds: number[]; plan: DeletePlan };

/* ------------------------------- Group card ------------------------------- */

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
  const extrasKb = files.filter((file) => file.id !== canonicalId).reduce((sum, file) => sum + file.size, 0);

  return (
    <GroupCard>
      <GroupHeader>
        <Flex gap={2} alignItems="center" wrap="wrap">
          <Badge backgroundColor={group.kind === 'exact' ? 'primary600' : 'alternative600'} textColor="neutral0">
            {group.kind === 'exact' ? 'Exact' : 'Similar'}
          </Badge>
          <Typography variant="pi" fontWeight="bold">
            {files.length} files
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            · {formatKb(extrasKb)} in extras
          </Typography>
        </Flex>
        <GroupReason title={group.reason}>{group.reason}</GroupReason>
      </GroupHeader>
      {layout === 'grid' ? (
        <GroupBody>
          <FileGrid
            files={files}
            layout={layout}
            selected={selected}
            ignoredIds={ignoredIds}
            canonicalId={canonicalId}
            onCanonical={onCanonical}
            onToggle={onToggle}
          />
        </GroupBody>
      ) : (
        <FileGrid
          files={files}
          layout={layout}
          selected={selected}
          ignoredIds={ignoredIds}
          canonicalId={canonicalId}
          onCanonical={onCanonical}
          onToggle={onToggle}
        />
      )}
    </GroupCard>
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
}) => {
  const cards = files.map((file) => (
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
  ));

  if (layout === 'list') {
    return <ListStack>{cards}</ListStack>;
  }
  return <TileGrid>{cards}</TileGrid>;
};

/* ------------------------------ Preview panel ----------------------------- */

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
  const canonical = preview.kind === 'reassign' ? filesById.get(preview.canonicalId) : undefined;

  return (
    <PreviewBar>
      <PreviewInfo>
        <Flex gap={2} alignItems="center">
          {preview.kind === 'reassign' ? <Duplicate width={16} height={16} aria-hidden /> : <Trash width={16} height={16} aria-hidden />}
          <Typography variant="omega" fontWeight="bold">
            {preview.kind === 'reassign' ? 'Reassign preview' : 'Delete preview'}
          </Typography>
          {canonical?.mime.startsWith('image/') ? <PreviewThumb src={canonical.formats?.thumbnail?.url || canonical.url} alt="" /> : null}
        </Flex>
        <Typography variant="pi" textColor="neutral600">
          {preview.kind === 'reassign' ? (
            <>
              Keep <strong>{fileName(filesById, preview.canonicalId)}</strong>. Rewrites{' '}
              <strong>{preview.plan.morphUpdates.length}</strong> morph relation(s) and{' '}
              <strong>{preview.plan.softRewrites.length}</strong> rich-text / Blocks field(s), then deletes{' '}
              <strong>{preview.extraIds.length}</strong> extra file(s) if the verify step finds no remaining references.
            </>
          ) : (
            <>
              <strong>{preview.fileIds.length}</strong> file(s) selected for deletion.
              {blocked.length > 0 ? (
                <>
                  {' '}
                  <strong>{blocked.length}</strong> still referenced — apply will be refused.
                </>
              ) : (
                ' A pre-delete scan found no references.'
              )}
            </>
          )}
        </Typography>
      </PreviewInfo>
      <Flex gap={2} shrink={0}>
        <Button variant="tertiary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onApply} loading={busy} disabled={blocked.length > 0} variant={preview.kind === 'delete' ? 'danger' : 'default'}>
          Apply
        </Button>
      </Flex>
    </PreviewBar>
  );
};

/* ------------------------------- Small parts ------------------------------ */

const Stat = ({ value, label, accent }: { value: string; label: string; accent?: boolean }) => (
  <StatItem>
    <Typography variant="delta" fontWeight="bold" textColor={accent ? 'success600' : 'neutral800'}>
      {value}
    </Typography>
    <Typography variant="pi" textColor="neutral600">
      {label}
    </Typography>
  </StatItem>
);

const EmptyState = ({ title, text }: { title: string; text: string }) => (
  <EmptyWrap>
    <Images width={32} height={32} aria-hidden />
    <Typography variant="delta">{title}</Typography>
    <Typography variant="pi" textColor="neutral600">
      {text}
    </Typography>
  </EmptyWrap>
);

/* --------------------------------- helpers -------------------------------- */

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

function formatKb(kb: number) {
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${Math.round(kb)} KB`;
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

/* --------------------------------- styles --------------------------------- */

const PageWrap = styled.div`
  width: 100%;
`;

const StatStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 64px;

  & > * {
    display: block;
  }
`;

const StatDivider = styled.div`
  width: 1px;
  align-self: stretch;
  background: ${({ theme }) => theme.colors.neutral150};
`;

const TabsBar = styled.div`
  display: flex;
  gap: 24px;
  margin-top: 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral200};
`;

const TabItem = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  padding: 10px 2px;
  margin-bottom: -1px;
  cursor: pointer;
  font-size: 1.4rem;
  font-weight: 600;
  color: ${({ theme, $active }) => ($active ? theme.colors.primary600 : theme.colors.neutral600)};
  border-bottom: 2px solid ${({ theme, $active }) => ($active ? theme.colors.primary600 : 'transparent')};

  &:hover {
    color: ${({ theme }) => theme.colors.primary600};
  }
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const SearchBox = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  min-width: 220px;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.neutral500};

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary600};
  }

  input {
    border: 0;
    outline: 0;
    background: none;
    flex: 1;
    font-size: 1.3rem;
    color: ${({ theme }) => theme.colors.neutral800};

    &::placeholder {
      color: ${({ theme }) => theme.colors.neutral500};
    }
  }
`;

const Segmented = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const SegmentButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 30px;
  border: 0;
  cursor: pointer;
  background: ${({ theme, $active }) => ($active ? theme.colors.primary100 : theme.colors.neutral0)};
  color: ${({ theme, $active }) => ($active ? theme.colors.primary600 : theme.colors.neutral600)};

  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.neutral200};
  }
`;

const GroupStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
`;

const GroupCard = styled.div`
  width: 100%;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const GroupHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral150};
  background: ${({ theme }) => theme.colors.neutral100};
`;

const GroupReason = styled.span`
  color: ${({ theme }) => theme.colors.neutral500};
  font-size: 1.1rem;
  font-family: ui-monospace, 'SF Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const GroupBody = styled.div`
  padding: 12px;
`;

const TileGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  width: 100%;
`;

const ListStack = styled.div`
  width: 100%;
`;

const UnusedPanel = styled.div<{ $list: boolean }>`
  width: 100%;
  ${({ $list, theme }) =>
    $list
      ? `background: ${theme.colors.neutral0}; border: 1px solid ${theme.colors.neutral150}; border-radius: ${theme.borderRadius}; overflow: hidden;`
      : ''}
`;

const EmptyWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px dashed ${({ theme }) => theme.colors.neutral200};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.neutral400};
  text-align: center;
`;

const PreviewBar = styled.div`
  position: sticky;
  bottom: 0;
  z-index: 4;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 40px;
  background: ${({ theme }) => theme.colors.neutral0};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral200};
  box-shadow: 0 -2px 8px rgba(33, 33, 52, 0.1);
`;

const PreviewInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const PreviewThumb = styled.img`
  width: 24px;
  height: 24px;
  border-radius: ${({ theme }) => theme.borderRadius};
  object-fit: cover;
`;

export { HomePage };
