import { registerDecorator, ValidationOptions } from 'class-validator';
import { isCommonPassword } from './common-passwords';

export function IsNotCommonPassword(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isNotCommonPassword',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: 'password is too common', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && !isCommonPassword(value),
      },
    });
}
