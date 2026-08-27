import { createHash } from 'node:crypto';

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function hammingDistanceHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  const length = a.length;

  for (let i = 0; i < length; i += 1) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    distance += bitCount4(x);
  }

  return distance;
}

export function bitsToHex(bits: number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/**
 * 64-bit pHash from a 32×32 greyscale matrix (0–255).
 * DCT-II, 8×8 low frequencies, DC bit forced to 0, median threshold.
 */
export function pHashFromPixels(matrix32: number[][]): string {
  assertMatrix(matrix32, 32, 32);
  const dct = dct2(matrix32);
  const coeffs: number[] = [];

  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (x === 0 && y === 0) {
        continue;
      }
      coeffs.push(dct[y][x]);
    }
  }

  const median = medianOf(coeffs);
  const range = Math.max(...coeffs.map((value) => Math.abs(value - median)));
  const bits: number[] = [0];

  // A flat image has a near-zero AC spectrum; keep every bit 0 instead of
  // letting floating-point noise flip the median test.
  if (range < 1e-6) {
    return bitsToHex(Array(64).fill(0));
  }

  for (const value of coeffs) {
    bits.push(value > median ? 1 : 0);
  }

  return bitsToHex(bits);
}

/**
 * 64-bit dHash from a 9×8 greyscale matrix (0–255).
 */
export function dHashFromPixels(matrix9x8: number[][]): string {
  assertMatrix(matrix9x8, 8, 9);
  const bits: number[] = [];

  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits.push(matrix9x8[y][x] > matrix9x8[y][x + 1] ? 1 : 0);
    }
  }

  return bitsToHex(bits);
}

export function dct2(matrix: number[][]): number[][] {
  const n = matrix.length;
  const result: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const factor = Math.PI / (2 * n);

  for (let u = 0; u < n; u += 1) {
    for (let v = 0; v < n; v += 1) {
      let sum = 0;
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          sum +=
            matrix[y][x] *
            Math.cos((2 * y + 1) * u * factor) *
            Math.cos((2 * x + 1) * v * factor);
        }
      }
      const cu = u === 0 ? Math.SQRT1_2 : 1;
      const cv = v === 0 ? Math.SQRT1_2 : 1;
      result[u][v] = 0.25 * cu * cv * sum;
    }
  }

  return result;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function bitCount4(nibble: number): number {
  return (nibble & 1) + ((nibble >> 1) & 1) + ((nibble >> 2) & 1) + ((nibble >> 3) & 1);
}

function assertMatrix(matrix: number[][], rows: number, cols: number) {
  if (matrix.length !== rows || matrix.some((row) => row.length !== cols)) {
    throw new Error(`Expected a ${cols}×${rows} pixel matrix`);
  }
}
