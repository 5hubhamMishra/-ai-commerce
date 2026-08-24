import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const ALLOWED_IMAGE_EXTENSIONS = [
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
];

export function IsProductImageUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isProductImageUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isProductImageUrl(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an http(s) image URL or a safe root-relative image path`;
        },
      },
    });
  };
}

export function isProductImageUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 2048 || value.trim() !== value) {
    return false;
  }

  if (value.startsWith('/')) {
    return isSafeRelativeImagePath(value);
  }

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (!parsed.hostname || parsed.username || parsed.password) return false;
    return hasAllowedImageExtension(parsed.pathname);
  } catch {
    return false;
  }
}

function isSafeRelativeImagePath(value: string) {
  if (value.startsWith('//') || value.includes('\\')) return false;

  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname.startsWith('/') || pathname.includes('\0')) return false;

  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.split('/').some((segment) => segment === '..')) return false;
  } catch {
    return false;
  }

  return hasAllowedImageExtension(pathname);
}

function hasAllowedImageExtension(pathname: string) {
  const lowerPath = pathname.toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((extension) =>
    lowerPath.endsWith(extension),
  );
}
