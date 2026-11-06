import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

export interface ProblemDetailsError {
  field: string;
  messages: string[];
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: ProblemDetailsError[];
}

/** Thrown by the ValidationPipe factory; carries field-level errors. */
export class ValidationProblem extends HttpException {
  constructor(public readonly errors: ProblemDetailsError[]) {
    super('Request validation failed.', HttpStatus.BAD_REQUEST);
  }
}

/** RFC 9457 Problem Details for every error. Never leaks stack traces or internals. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException) || status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const body: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: this.detailFor(exception),
      instance: request.originalUrl,
    };
    if (exception instanceof ValidationProblem) {
      body.errors = exception.errors;
    }

    response.status(status).type('application/problem+json').json(body);
  }

  private detailFor(exception: unknown): string {
    if (!(exception instanceof HttpException)) return 'An unexpected error occurred.';
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    return typeof message === 'string' ? message : exception.message;
  }
}
