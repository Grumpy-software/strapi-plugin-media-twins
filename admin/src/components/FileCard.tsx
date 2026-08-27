import { Box, Checkbox, Flex, Typography } from '@strapi/design-system';

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

const FileCard = ({ file, selected, canonical, layout, onToggle, onCanonical, disabled }: FileCardProps) => {
  const preview = file.formats?.thumbnail?.url || file.formats?.small?.url || file.url;
  const isImage = file.mime.startsWith('image/');

  return (
    <Box
      background="neutral0"
      borderColor={canonical ? 'primary600' : 'neutral200'}
      hasRadius
      padding={3}
      style={{ borderWidth: canonical ? 2 : 1, opacity: disabled ? 0.55 : 1 }}
    >
      <Flex direction={layout === 'list' ? 'row' : 'column'} gap={3} alignItems={layout === 'list' ? 'center' : 'stretch'}>
        <Box
          background="neutral150"
          hasRadius
          style={{
            width: layout === 'list' ? 72 : '100%',
            height: layout === 'list' ? 72 : 160,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isImage && preview ? (
            <img src={preview} alt={file.alternativeText || file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Typography variant="pi" textColor="neutral600">
              {file.ext || file.mime}
            </Typography>
          )}
        </Box>

        <Flex direction="column" gap={1} style={{ minWidth: 0, flex: 1 }}>
          <Flex justifyContent="space-between" alignItems="flex-start" gap={2}>
            <Typography fontWeight="bold" ellipsis title={file.name}>
              {file.name}
            </Typography>
            {onToggle ? <Checkbox checked={Boolean(selected)} onCheckedChange={onToggle} disabled={disabled} /> : null}
          </Flex>
          <Typography variant="pi" textColor="neutral600">
            {formatSize(file.size)} · {file.folderPath || '/'}
          </Typography>
          {canonical ? (
            <Typography variant="pi" textColor="primary600" fontWeight="bold">
              Canonical
            </Typography>
          ) : onCanonical ? (
            <button
              type="button"
              onClick={onCanonical}
              style={{
                border: 0,
                background: 'none',
                padding: 0,
                color: '#4945ff',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 12,
              }}
            >
              Set as canonical
            </button>
          ) : null}
        </Flex>
      </Flex>
    </Box>
  );
};

function formatSize(kb: number) {
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${Math.round(kb)} KB`;
}

export { FileCard };
