import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { decodeProductImage } from './seller-uploads.controller';

describe('seller image decoding', () => {
  it('re-encodes a valid image and rejects spoofed, malformed and oversized files', async () => {
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#c08040' },
    })
      .png()
      .toBuffer();
    const result = await decodeProductImage({ buffer, mimetype: 'image/png' });
    expect((await sharp(result).metadata()).format).toBe('webp');
    for (const file of [
      undefined,
      { buffer, mimetype: 'image/jpeg' },
      {
        buffer: Buffer.from('<script>alert(1)</script>'),
        mimetype: 'image/png',
      },
      { buffer: Buffer.alloc(2 * 1024 * 1024 + 1), mimetype: 'image/png' },
      { buffer, mimetype: 'image/svg+xml' },
      {
        buffer: await sharp({
          create: {
            width: 4001,
            height: 4000,
            channels: 3,
            background: 'white',
          },
        })
          .png()
          .toBuffer(),
        mimetype: 'image/png',
      },
    ])
      await expect(decodeProductImage(file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
  });
});
