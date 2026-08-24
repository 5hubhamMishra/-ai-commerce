import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';
import { assertConfigPreflight } from './config-preflight';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  @IsOptional()
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsString()
  @MinLength(32, {
    message:
      'JWT_ACCESS_SECRET must be at least 32 characters — generate with `openssl rand -hex 32`',
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message:
      'JWT_REFRESH_SECRET must be at least 32 characters — generate with `openssl rand -hex 32`',
  })
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  WEB_ORIGIN?: string;

  @IsString()
  @MinLength(1, { message: 'ANTHROPIC_API_KEY is required for ShopAI' })
  ANTHROPIC_API_KEY!: string;

  // Not required — unset means every dev/test/e2e environment stays on the dev payment
  // adapter with zero env changes. Only format-checked when present; a selected 'razorpay'
  // with missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET fails closed at first use (matching the
  // webhook secret's own precedent), not at boot.
  @IsOptional()
  @IsIn(['development', 'razorpay'])
  PAYMENT_PROVIDER?: string;
}

/**
 * Fails fast at boot if required secrets/config are missing or malformed, rather than
 * failing confusingly later on the first request that needs them.
 */
export function validateEnv(config: Record<string, unknown>) {
  assertConfigPreflight(config, { mode: 'runtime' });

  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${messages}`);
  }

  return validated;
}
