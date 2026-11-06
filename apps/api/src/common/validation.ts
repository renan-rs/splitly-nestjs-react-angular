import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ProblemDetailsError, ValidationProblem } from './filters/problem-details.filter';

function flatten(errors: ValidationError[], parent = ''): ProblemDetailsError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationProblem(flatten(errors)),
  });
}
