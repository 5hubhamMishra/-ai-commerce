import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('returns structured JSON with a stable 422 code', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = { requestId: 'request-1' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new HttpException(
        { message: 'Invalid value' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Invalid value',
        requestId: 'request-1',
        details: {},
      },
    });
  });
});
