import { configureTrustProxy } from './create-app';

describe('configureTrustProxy', () => {
  it('trusts exactly one proxy hop on Vercel', () => {
    const set = jest.fn();

    configureTrustProxy({ set }, '1');

    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });

  it('does not trust forwarded IP headers locally', () => {
    const set = jest.fn();

    configureTrustProxy({ set }, undefined);

    expect(set).toHaveBeenCalledWith('trust proxy', false);
  });
});
