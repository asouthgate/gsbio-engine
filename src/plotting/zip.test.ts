import { describe, it, expect } from 'vitest';
import { buildZipBytes, crc32 } from './zip';

describe('crc32', () => {
  it('matches the known CRC of "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});

describe('buildZip', () => {
  it('writes local, central and end-of-directory records', () => {
    const bytes = buildZipBytes([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local header
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(1); // entry count
    expect(new TextDecoder().decode(bytes.slice(30, 35))).toBe('a.txt');
  });
});
