import * as crypto from 'crypto';

export class JwtHelper {
  private static base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private static base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  static sign(payload: any, secret: string, expiresInSeconds: number): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerStr = this.base64UrlEncode(JSON.stringify(header));

    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const fullPayload = { ...payload, exp };
    const payloadStr = this.base64UrlEncode(JSON.stringify(fullPayload));

    const signatureInput = `${headerStr}.${payloadStr}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${signatureInput}.${signature}`;
  }

  static verify(token: string, secret: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token structure');
    }

    const [headerStr, payloadStr, signature] = parts;
    const signatureInput = `${headerStr}.${payloadStr}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSignature) {
      throw new Error('Signature verification failed');
    }

    const payload = JSON.parse(this.base64UrlDecode(payloadStr));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw new Error('Token has expired');
    }

    return payload;
  }
}

export class PasswordHelper {
  static hash(
    password: string,
    salt = crypto.randomBytes(16).toString('hex'),
  ): string {
    const hash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
      .toString('hex');
    return `${salt}:${hash}`;
  }

  static verify(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const verifyHash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
      .toString('hex');
    return hash === verifyHash;
  }
}
