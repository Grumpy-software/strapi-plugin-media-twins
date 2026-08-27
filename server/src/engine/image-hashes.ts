import { dHashFromPixels, pHashFromPixels, sha256Hex } from './hash';

export async function hashFileBytes(bytes: Buffer): Promise<string> {
  return sha256Hex(bytes);
}

export async function computeImageHashes(bytes: Buffer): Promise<{ phash: string; dhash: string } | null> {
  let sharp: ((input: Buffer) => any) | null = null;
  try {
    const mod = await import('sharp');
    sharp = (mod as { default?: (input: Buffer) => any }).default ?? (mod as unknown as (input: Buffer) => any);
  } catch {
    return null;
  }

  if (!sharp) {
    return null;
  }

  try {
    const [matrix32, matrix9x8] = await Promise.all([
      greyscaleMatrix(sharp, bytes, 32, 32),
      greyscaleMatrix(sharp, bytes, 9, 8),
    ]);

    return {
      phash: pHashFromPixels(matrix32),
      dhash: dHashFromPixels(matrix9x8),
    };
  } catch {
    return null;
  }
}

async function greyscaleMatrix(
  sharp: (input: Buffer) => any,
  bytes: Buffer,
  width: number,
  height: number
): Promise<number[][]> {
  const { data } = await sharp(bytes)
    .rotate()
    .greyscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const matrix: number[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < width; x += 1) {
      row.push(data[y * width + x]);
    }
    matrix.push(row);
  }
  return matrix;
}
