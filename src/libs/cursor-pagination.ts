import { BadRequestException } from '@nestjs/common';

export function encodeCursor<T>(value: T): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(
  cursor: string,
  parsePayload: (payload: unknown) => T,
  errorMessage = 'Invalid cursor',
): T {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();

    const encoded = Buffer.from(cursor, 'base64url');
    if (encoded.toString('base64url') !== cursor) throw new Error();

    return parsePayload(JSON.parse(encoded.toString('utf8')) as unknown);
  } catch {
    throw new BadRequestException(errorMessage);
  }
}
