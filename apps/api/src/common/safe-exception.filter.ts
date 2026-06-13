import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AlertingService } from '../alerts/alerts.service';

const DEFAULT_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error'
};

const SENSITIVE_PATTERNS = [
  /\b[A-Z][A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL|APP_SECRET)\b/i,
  /\b(mysql|postgresql|mongodb|redis):\/\/\S+/i,
  /(^|\s)(\/Users|\/home|\/var|\/private\/var|[A-Za-z]:\\)[^\s"]+/,
  /\b(apps|src|dist)\/[A-Za-z0-9._/-]+:\d+:\d+\b/,
  /\bat\s+[A-Za-z0-9_.<>]+\s+\([^)]+\)/
];

@Catch()
@Injectable()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly production: boolean;

  constructor(
    config: ConfigService,
    private readonly alerting: AlertingService
  ) {
    this.production = config.get<string>('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.createResponseBody(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      void this.alerting.notify({
        source: 'api',
        event: 'http_server_error',
        severity: 'critical',
        message: this.errorMessage(exception),
        metadata: {
          statusCode: status,
          method: request.method,
          path: request.url
        }
      });
    }

    response.status(status).json(body);
  }

  private createResponseBody(exception: unknown, status: number) {
    if (!(exception instanceof HttpException)) {
      return this.defaultBody(status);
    }

    const exceptionResponse = exception.getResponse();
    const body = typeof exceptionResponse === 'string' ? { statusCode: status, message: exceptionResponse } : exceptionResponse;

    if (!this.production || !this.containsSensitiveDetails(body)) {
      return body;
    }

    return this.defaultBody(status);
  }

  private defaultBody(status: number) {
    return {
      statusCode: status,
      message: DEFAULT_MESSAGES[status] ?? 'Request failed'
    };
  }

  private containsSensitiveDetails(value: unknown) {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(JSON.stringify(value)));
  }

  private errorMessage(exception: unknown) {
    return exception instanceof Error ? exception.message : 'Unknown server error';
  }
}
