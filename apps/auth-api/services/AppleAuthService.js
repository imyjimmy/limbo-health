import { createRemoteJWKSet, jwtVerify } from 'jose';
import { asCleanString } from './googleProfileBackfill.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

export class AppleAuthService {
  constructor() {
    this.audience =
      process.env.APPLE_IOS_CLIENT_ID ||
      process.env.APPLE_BUNDLE_ID ||
      'com.limbohealth.mobile';
  }

  async verifyIdentityToken(identityToken, {
    user = null,
    email = null,
    firstName = null,
    lastName = null,
    name = null,
  } = {}) {
    if (!identityToken) {
      throw new Error('Missing identityToken');
    }

    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: this.audience,
    });

    const appleUserId = asCleanString(payload?.sub);
    if (!appleUserId) {
      throw new Error('Apple token missing subject');
    }

    const providedUser = asCleanString(user);
    if (providedUser && providedUser !== appleUserId) {
      throw new Error('Apple credential user mismatch');
    }

    const normalizedFirstName = asCleanString(firstName);
    const normalizedLastName = asCleanString(lastName);
    const normalizedName =
      asCleanString(name) ||
      [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ').trim() ||
      null;

    return {
      appleUserId,
      providerUserId: appleUserId,
      email: asCleanString(payload?.email) ?? asCleanString(email),
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      name: normalizedName,
      emailVerified: asBoolean(payload?.email_verified),
      isPrivateEmail: asBoolean(payload?.is_private_email),
    };
  }
}
