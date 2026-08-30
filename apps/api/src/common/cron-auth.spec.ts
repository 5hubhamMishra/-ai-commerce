import { isAuthorizedCronRequest } from './cron-auth';

describe('isAuthorizedCronRequest', () => {
  it('accepts the exact bearer secret', () => {
    expect(isAuthorizedCronRequest('Bearer cron-secret', 'cron-secret')).toBe(
      true,
    );
  });

  it('rejects a missing secret instead of authorizing Bearer undefined', () => {
    expect(isAuthorizedCronRequest('Bearer undefined', undefined)).toBe(false);
  });

  it('rejects mismatched or repeated authorization headers', () => {
    expect(isAuthorizedCronRequest('Bearer wrong', 'cron-secret')).toBe(false);
    expect(
      isAuthorizedCronRequest(
        ['Bearer cron-secret', 'Bearer other'],
        'cron-secret',
      ),
    ).toBe(false);
  });

  it('trims configuration whitespace without weakening the header check', () => {
    expect(isAuthorizedCronRequest('Bearer cron-secret', ' cron-secret ')).toBe(
      true,
    );
    expect(isAuthorizedCronRequest('Bearer   ', '   ')).toBe(false);
  });
});
