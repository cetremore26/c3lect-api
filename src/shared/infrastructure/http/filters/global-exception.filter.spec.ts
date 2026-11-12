import { ArgumentsHost } from '@nestjs/common';
import {
  NotFoundError,
  TooManyRequestsError,
} from '../../../domain/domain-error';
import { GlobalExceptionFilter } from './global-exception.filter';

function run(error: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(error, host);
  return { status, json };
}

describe('GlobalExceptionFilter', () => {
  it('TooManyRequestsError → 429', () => {
    const { status } = run(new TooManyRequestsError('muchos'));
    expect(status).toHaveBeenCalledWith(429);
  });

  it('NotFoundError → 404', () => {
    const { status } = run(new NotFoundError('no'));
    expect(status).toHaveBeenCalledWith(404);
  });
});
