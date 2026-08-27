import type { MediaFile } from './types';

const MIN_TOKEN_LENGTH = 8;

export function fileTokens(file: MediaFile): string[] {
  const tokens = new Set<string>();

  addToken(tokens, file.hash);
  addToken(tokens, file.url);

  if (file.formats) {
    for (const format of Object.values(file.formats)) {
      addToken(tokens, format?.hash);
      addToken(tokens, format?.url);
    }
  }

  return [...tokens].sort((a, b) => b.length - a.length);
}

export function blobContainsToken(blob: string, tokens: string[]): string | null {
  if (!blob) {
    return null;
  }

  for (const token of tokens) {
    if (blob.includes(token)) {
      return token;
    }
  }

  return null;
}

export function buildReplacementMap(extra: MediaFile, canonical: MediaFile): Array<[string, string]> {
  const pairs = new Map<string, string>();

  if (extra.url && canonical.url) {
    pairs.set(extra.url, canonical.url);
  }
  if (extra.hash && canonical.hash) {
    pairs.set(extra.hash, canonical.hash);
  }

  const extraFormats = extra.formats ?? {};
  const canonicalFormats = canonical.formats ?? {};

  for (const [name, format] of Object.entries(extraFormats)) {
    const target = canonicalFormats[name];
    if (format?.url) {
      pairs.set(format.url, target?.url ?? canonical.url);
    }
    if (format?.hash) {
      pairs.set(format.hash, target?.hash ?? canonical.hash);
    }
  }

  return [...pairs.entries()]
    .filter(([from, to]) => from && to && from !== to && from.length >= MIN_TOKEN_LENGTH)
    .sort((a, b) => b[0].length - a[0].length);
}

export function applyTokenReplacements(input: string, replacements: Array<[string, string]>): {
  value: string;
  replacements: number;
} {
  let value = input;
  let count = 0;

  for (const [from, to] of replacements) {
    if (!from || !value.includes(from)) {
      continue;
    }

    const pieces = value.split(from);
    count += pieces.length - 1;
    value = pieces.join(to);
  }

  return { value, replacements: count };
}

function addToken(tokens: Set<string>, value?: string | null) {
  if (value && value.length >= MIN_TOKEN_LENGTH) {
    tokens.add(value);
  }
}
