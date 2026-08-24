import { buildLoadTestPlan, normalizeBaseUrl } from './load-test-plan';

describe('load-test-plan', () => {
  it('builds a conservative local plan', () => {
    const plan = buildLoadTestPlan({
      LOAD_TEST_BASE_URL: 'http://localhost:4000/api/v1/',
      LOAD_TEST_TARGET_ENV: 'local',
    });

    expect(plan).toMatchObject({
      baseUrl: 'http://localhost:4000/api/v1',
      targetEnv: 'local',
      connections: 4,
      pipelining: 1,
      requestsPerScenario: 10,
    });
    expect(plan.scenarios.length).toBeGreaterThan(0);
  });

  it('refuses production targets explicitly', () => {
    expect(() =>
      buildLoadTestPlan({
        LOAD_TEST_BASE_URL: 'https://api.example.com/api/v1',
        LOAD_TEST_TARGET_ENV: 'production',
      }),
    ).toThrow('Production load testing is refused');
  });

  it('refuses production-looking hostnames', () => {
    expect(() =>
      buildLoadTestPlan({
        LOAD_TEST_BASE_URL: 'https://prod-api.example.com/api/v1',
        LOAD_TEST_TARGET_ENV: 'preview',
        LOAD_TEST_SYNTHETIC_DATASET: 'true',
        LOAD_TEST_ALLOWED_HOSTS: 'prod-api.example.com',
      }),
    ).toThrow('Production-looking hostnames are refused');
  });

  it('requires exact host allow-listing and synthetic data for non-local targets', () => {
    expect(() =>
      buildLoadTestPlan({
        LOAD_TEST_BASE_URL: 'https://preview.example.com/api/v1',
        LOAD_TEST_TARGET_ENV: 'preview',
      }),
    ).toThrow('LOAD_TEST_SYNTHETIC_DATASET=true');

    expect(() =>
      buildLoadTestPlan({
        LOAD_TEST_BASE_URL: 'https://preview.example.com/api/v1',
        LOAD_TEST_TARGET_ENV: 'preview',
        LOAD_TEST_SYNTHETIC_DATASET: 'true',
        LOAD_TEST_ALLOWED_HOSTS: 'other.example.com',
      }),
    ).toThrow('LOAD_TEST_ALLOWED_HOSTS');
  });

  it('accepts a declared preview host with synthetic data', () => {
    const plan = buildLoadTestPlan({
      LOAD_TEST_BASE_URL: 'https://preview.example.com/api/v1',
      LOAD_TEST_TARGET_ENV: 'preview',
      LOAD_TEST_SYNTHETIC_DATASET: 'true',
      LOAD_TEST_ALLOWED_HOSTS: 'preview.example.com',
      LOAD_TEST_CONNECTIONS: '8',
      LOAD_TEST_REQUESTS_PER_SCENARIO: '25',
      LOAD_TEST_MAX_P97_5_MS: '500',
    });

    expect(plan).toMatchObject({
      baseUrl: 'https://preview.example.com/api/v1',
      targetEnv: 'preview',
      connections: 8,
      requestsPerScenario: 25,
      maxP97_5Ms: 500,
    });
  });

  it('normalizes base URLs without query strings or fragments', () => {
    expect(normalizeBaseUrl('https://example.com/api/v1/?x=1#frag')).toBe(
      'https://example.com/api/v1',
    );
  });
});
