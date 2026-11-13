import { deflateSync } from 'node:zlib';

export function capturePng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const footer = Buffer.alloc(4);
    footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, footer]);
  };
  const dimensions = Buffer.alloc(13);
  dimensions.writeUInt32BE(1440, 0);
  dimensions.writeUInt32BE(900, 4);
  dimensions[8] = 8;
  dimensions[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', dimensions),
    chunk('IDAT', deflateSync(Buffer.alloc((1440 * 3 + 1) * 900))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
