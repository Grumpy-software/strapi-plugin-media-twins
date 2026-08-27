import { Badge, Checkbox, Typography } from '@strapi/design-system';
import { Crown } from '@strapi/icons';
import styled from 'styled-components';

import type { MediaFile } from '../api/types';

type FileCardProps = {
  file: MediaFile;
  selected?: boolean;
  canonical?: boolean;
  layout: 'grid' | 'list';
  onToggle?: () => void;
  onCanonical?: () => void;
  disabled?: boolean;
};

const FileCard = (props: FileCardProps) => (props.layout === 'list' ? <FileRow {...props} /> : <FileTile {...props} />);

/* ------------------------------- Grid tile ------------------------------- */

const FileTile = ({ file, selected, canonical, onToggle, onCanonical, disabled }: FileCardProps) => {
  const preview = file.formats?.thumbnail?.url || file.formats?.small?.url || file.url;
  const isImage = file.mime.startsWith('image/');

  return (
    <Tile
      $canonical={Boolean(canonical)}
      $selected={Boolean(selected)}
      $disabled={Boolean(disabled)}
      onClick={onToggle && !disabled ? onToggle : undefined}
      role={onToggle ? 'button' : undefined}
      title={`${file.name} · ${formatSize(file.size)} · ${file.folderPath || '/'}`}
    >
      <Thumb>
        {isImage && preview ? (
          <img src={preview} alt={file.alternativeText || file.name} loading="lazy" />
        ) : (
          <Typography variant="pi" textColor="neutral600">
            {file.ext || file.mime}
          </Typography>
        )}
        {canonical ? (
          <CanonicalBadge>
            <Crown width={10} height={10} aria-hidden />
            Canonical
          </CanonicalBadge>
        ) : onCanonical ? (
          <MakeCanonical
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCanonical();
            }}
          >
            Make canonical
          </MakeCanonical>
        ) : null}
        {onToggle ? (
          <CheckSlot onClick={(event) => event.stopPropagation()}>
            <Checkbox checked={Boolean(selected)} onCheckedChange={onToggle} disabled={disabled} aria-label={`Select ${file.name}`} />
          </CheckSlot>
        ) : null}
      </Thumb>
      <TileMeta>
        <Typography variant="pi" fontWeight="bold" ellipsis>
          {file.name}
        </Typography>
        <MetaLine>
          {formatSize(file.size)}
          {file.width && file.height ? ` · ${file.width}×${file.height}` : ''} · {file.folderPath || '/'}
        </MetaLine>
      </TileMeta>
    </Tile>
  );
};

/* -------------------------------- List row ------------------------------- */

const FileRow = ({ file, selected, canonical, onToggle, onCanonical, disabled }: FileCardProps) => {
  const preview = file.formats?.thumbnail?.url || file.formats?.small?.url || file.url;
  const isImage = file.mime.startsWith('image/');

  return (
    <Row $canonical={Boolean(canonical)} $disabled={Boolean(disabled)}>
      <span onClick={(event) => event.stopPropagation()}>
        {onToggle ? (
          <Checkbox checked={Boolean(selected)} onCheckedChange={onToggle} disabled={disabled} aria-label={`Select ${file.name}`} />
        ) : null}
      </span>
      <RowThumb>
        {isImage && preview ? (
          <img src={preview} alt={file.alternativeText || file.name} loading="lazy" />
        ) : (
          <Typography variant="pi" textColor="neutral600">
            {file.ext || file.mime}
          </Typography>
        )}
      </RowThumb>
      <RowName>
        <Typography variant="omega" fontWeight="semiBold" ellipsis title={file.name}>
          {file.name}
        </Typography>
        {canonical ? (
          <Badge backgroundColor="primary600" textColor="neutral0">
            Canonical
          </Badge>
        ) : null}
      </RowName>
      <RowCell>{file.width && file.height ? `${file.width}×${file.height}` : '—'}</RowCell>
      <RowCell>{formatSize(file.size)}</RowCell>
      <RowCell $ellipsis title={file.folderPath || '/'}>
        {file.folderPath || '/'}
      </RowCell>
      <RowAction>
        {!canonical && onCanonical ? (
          <MakeCanonicalInline type="button" onClick={onCanonical}>
            Make canonical
          </MakeCanonicalInline>
        ) : null}
      </RowAction>
    </Row>
  );
};

function formatSize(kb: number) {
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${Math.round(kb)} KB`;
}

/* --------------------------------- styles -------------------------------- */

const Tile = styled.div<{ $canonical: boolean; $selected: boolean; $disabled: boolean }>`
  position: relative;
  width: 100%;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme, $canonical }) => ($canonical ? theme.colors.primary600 : theme.colors.neutral200)};
  box-shadow: ${({ theme, $canonical, $selected }) =>
    $canonical
      ? `0 0 0 1px ${theme.colors.primary600}`
      : $selected
        ? `0 0 0 1px ${theme.colors.primary200}`
        : 'none'};
  overflow: hidden;
  opacity: ${({ $disabled }) => ($disabled ? 0.55 : 1)};
  cursor: ${({ onClick }) => (onClick ? 'pointer' : 'default')};
  transition: box-shadow 120ms ease;

  &:hover {
    box-shadow: 0 1px 4px rgba(33, 33, 52, 0.16);
  }
`;

const Thumb = styled.div`
  position: relative;
  aspect-ratio: 4 / 3;
  background: ${({ theme }) => theme.colors.neutral150};
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const CheckSlot = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral0};
  box-shadow: 0 1px 3px rgba(33, 33, 52, 0.25);
  padding: 2px;
`;

const CanonicalBadge = styled.span`
  position: absolute;
  top: 4px;
  left: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary600};
  color: ${({ theme }) => theme.colors.neutral0};
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.4;
`;

const MakeCanonical = styled.button`
  position: absolute;
  top: 4px;
  left: 4px;
  border: 0;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: rgba(33, 33, 52, 0.7);
  color: ${({ theme }) => theme.colors.neutral0};
  font-size: 1.1rem;
  line-height: 1.4;
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms ease;

  ${Tile}:hover & {
    opacity: 1;
  }

  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.primary600};
  }
`;

const TileMeta = styled.div`
  padding: 6px 8px 8px;
  min-width: 0;

  & > * {
    display: block;
  }
`;

const MetaLine = styled.span`
  display: block;
  color: ${({ theme }) => theme.colors.neutral600};
  font-size: 1.1rem;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Row = styled.div<{ $canonical: boolean; $disabled: boolean }>`
  display: grid;
  grid-template-columns: 24px 36px minmax(160px, 2fr) 100px 80px minmax(90px, 1fr) 120px;
  gap: 12px;
  align-items: center;
  padding: 5px 12px;
  background: ${({ theme, $canonical }) => ($canonical ? theme.colors.primary100 : theme.colors.neutral0)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral150};
  opacity: ${({ $disabled }) => ($disabled ? 0.55 : 1)};

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: ${({ theme, $canonical }) => ($canonical ? theme.colors.primary100 : theme.colors.neutral100)};
  }
`;

const RowThumb = styled.div`
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral150};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const RowName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const RowCell = styled.span<{ $ellipsis?: boolean }>`
  color: ${({ theme }) => theme.colors.neutral600};
  font-size: 1.2rem;
  ${({ $ellipsis }) => ($ellipsis ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' : '')}
`;

const RowAction = styled.span`
  display: flex;
  justify-content: flex-end;
`;

const MakeCanonicalInline = styled.button`
  border: 0;
  background: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.primary600};
  font-size: 1.2rem;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

export { FileCard };
