import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Core } from '@strapi/strapi';

import type { MediaFile } from '../engine/types';

type ByteStream = {
  on(event: 'data' | 'end' | 'error', listener: (...args: any[]) => void): ByteStream;
};

export async function readOriginalBytes(strapi: Core.Strapi, file: MediaFile): Promise<Buffer> {
  const provider = strapi.plugin('upload').provider as {
    getStream?: (file: unknown) => Promise<ByteStream> | ByteStream;
    fetch?: (file: unknown) => Promise<Buffer>;
  };

  if (typeof provider.getStream === 'function') {
    const stream = await provider.getStream(file);
    return streamToBuffer(stream);
  }

  if (typeof provider.fetch === 'function') {
    return provider.fetch(file);
  }

  const publicDir = (strapi.dirs as { static?: { public?: string } }).static?.public;
  if (publicDir && file.url) {
    const relative = file.url.startsWith('/') ? file.url.slice(1) : file.url;
    return readFile(path.join(publicDir, relative));
  }

  throw new Error(`Cannot read bytes for file ${file.id}`);
}

function streamToBuffer(stream: ByteStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
