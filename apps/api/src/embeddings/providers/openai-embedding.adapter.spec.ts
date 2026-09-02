import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddingAdapter } from './openai-embedding.adapter';

describe('OpenAIEmbeddingAdapter', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('requests 64-dimensional embeddings with the configured model', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ data: [{ embedding: new Array(64).fill(0.1) }] }),
    });
    const config = {
      get: jest.fn().mockReturnValue('test-key'),
    } as unknown as ConfigService;
    const adapter = new OpenAIEmbeddingAdapter(config);

    await expect(adapter.embedText('wireless headphones')).resolves.toEqual({
      vector: new Array(64).fill(0.1),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: 'wireless headphones',
          dimensions: 64,
          encoding_format: 'float',
        }),
      }),
    );
  });

  it('fails without turning a provider error into a fake vector', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const config = {
      get: jest.fn().mockReturnValue('test-key'),
    } as unknown as ConfigService;
    const adapter = new OpenAIEmbeddingAdapter(config);

    await expect(adapter.embedText('wireless')).rejects.toThrow(
      'OpenAI embedding request failed (429)',
    );
  });

  it('maps a batch request to the returned vectors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { embedding: new Array(64).fill(0.1) },
            { embedding: new Array(64).fill(0.2) },
          ],
        }),
    });
    const config = {
      get: jest.fn().mockReturnValue('test-key'),
    } as unknown as ConfigService;
    const adapter = new OpenAIEmbeddingAdapter(config);
    const inputs = [
      {
        productId: 'p1',
        name: 'Headphones',
        description: 'Wireless',
        categoryId: 'audio',
        brandId: null,
        tags: ['bluetooth'],
        specificationValues: [],
      },
      {
        productId: 'p2',
        name: 'Backpack',
        description: 'Travel',
        categoryId: 'bags',
        brandId: null,
        tags: [],
        specificationValues: [],
      },
    ];

    await expect(adapter.embedMany(inputs)).resolves.toEqual([
      { vector: new Array(64).fill(0.1) },
      { vector: new Array(64).fill(0.2) },
    ]);
    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body).input).toEqual([
      'Headphones\nWireless\nbluetooth\n',
      'Backpack\nTravel\n\n',
    ]);
  });

  it('rejects malformed provider responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ embedding: ['not-a-number'] }] }),
    });
    const config = {
      get: jest.fn().mockReturnValue('test-key'),
    } as unknown as ConfigService;
    const adapter = new OpenAIEmbeddingAdapter(config);

    await expect(adapter.embedText('wireless')).rejects.toThrow(
      'no numeric vector',
    );
  });
});
