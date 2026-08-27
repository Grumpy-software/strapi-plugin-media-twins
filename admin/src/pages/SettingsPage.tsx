import { Box, Button, Flex, TextInput, Typography } from '@strapi/design-system';
import { Page, useFetchClient } from '@strapi/strapi/admin';
import { useEffect, useState } from 'react';

import type { IgnoreRule } from '../api/types';
import pluginPermissions from '../permissions';

const SettingsPage = () => {
  const { get, put, del } = useFetchClient();
  const [threshold, setThreshold] = useState('10');
  const [rules, setRules] = useState<IgnoreRule[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    const config = unwrap<{ similarityThreshold: number }>(await get('/media-twins/config'));
    setThreshold(String(config.similarityThreshold));
    setRules(unwrap<IgnoreRule[]>(await get('/media-twins/ignore')));
  };

  useEffect(() => {
    load().catch(() => setStatus('Could not load Media Twins settings.'));
  }, []);

  const save = async () => {
    const value = Number(threshold);
    await put('/media-twins/config', { similarityThreshold: value });
    setStatus('Threshold saved. The next scan uses this Hamming distance.');
  };

  const restore = async (id?: number) => {
    if (!id) return;
    await del(`/media-twins/ignore/${id}`);
    await load();
  };

  return (
    <Page.Protect permissions={pluginPermissions.configure}>
      <Page.Main>
        <Box padding={8}>
          <Typography variant="alpha" as="h1">
            Media Twins
          </Typography>
          <Box paddingTop={2} paddingBottom={6}>
            <Typography textColor="neutral600">
              Configure the similar-image threshold and review the ignore-list. Video similarity is not part of v1.
            </Typography>
          </Box>

          <Box background="neutral0" hasRadius borderColor="neutral200" padding={6} style={{ maxWidth: 640 }}>
            <TextInput
              label="Similarity threshold (Hamming distance)"
              hint="0–64. Default 10 matches resized, recompressed, or lightly cropped copies."
              name="threshold"
              type="number"
              value={threshold}
              onChange={(event: { target: { value: string } }) => setThreshold(event.target.value)}
            />
            <Box paddingTop={4}>
              <Button onClick={save}>Save threshold</Button>
            </Box>
          </Box>

          <Box paddingTop={8}>
            <Typography variant="delta">Ignore-list</Typography>
            <Box paddingTop={3}>
              {rules.length === 0 ? (
                <Typography textColor="neutral600">No ignored files or folders.</Typography>
              ) : (
                <Flex direction="column" gap={2}>
                  {rules.map((rule) => (
                    <Flex key={rule.id} justifyContent="space-between" background="neutral100" padding={3} hasRadius>
                      <Typography>
                        {rule.kind === 'folder' ? 'Folder' : 'File'} · {rule.label || rule.folderPath || rule.fileId}
                      </Typography>
                      <Button variant="tertiary" onClick={() => restore(rule.id)}>
                        Restore
                      </Button>
                    </Flex>
                  ))}
                </Flex>
              )}
            </Box>
          </Box>

          {status ? (
            <Box paddingTop={4}>
              <Typography textColor="neutral600">{status}</Typography>
            </Box>
          ) : null}
        </Box>
      </Page.Main>
    </Page.Protect>
  );
};

function unwrap<T>(response: unknown): T {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}

export { SettingsPage };
