import { validate } from 'class-validator';
import { CreateImageDto } from './create-image.dto';
import { isProductImageUrl } from './product-image-url.validator';

describe('product image URL validation', () => {
  it.each([
    'https://cdn.example.com/products/bag.webp',
    'http://localhost:3000/products/bag.jpg',
    '/products/accessories.svg',
    '/catalog/hero-image.avif?version=1',
  ])('accepts %s', (url) => {
    expect(isProductImageUrl(url)).toBe(true);
  });

  it.each([
    '',
    ' https://cdn.example.com/products/bag.webp',
    'ftp://cdn.example.com/products/bag.webp',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'https://user:pass@cdn.example.com/products/bag.webp',
    'https://cdn.example.com/products/readme.txt',
    '//cdn.example.com/products/bag.webp',
    '/products/../secret.png',
    '/products/%2e%2e/secret.png',
    '/products\\secret.png',
  ])('rejects %s', (url) => {
    expect(isProductImageUrl(url)).toBe(false);
  });

  it('surfaces validation errors through CreateImageDto', async () => {
    const dto = new CreateImageDto();
    dto.url = 'data:image/svg+xml;base64,PHN2Zy8+';

    await expect(validate(dto)).resolves.toEqual([
      expect.objectContaining({ property: 'url' }),
    ]);
  });
});
