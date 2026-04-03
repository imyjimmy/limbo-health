export function asCleanString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function splitHumanName(fullName) {
  const cleaned = asCleanString(fullName);
  if (!cleaned) return { firstName: null, lastName: null };

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function resolveGoogleNameParts(userInfo) {
  return resolveOAuthNameParts(userInfo);
}

export function resolveOAuthNameParts(userInfo) {
  const givenName = asCleanString(userInfo?.givenName);
  const familyName = asCleanString(userInfo?.familyName);
  if (givenName || familyName) {
    return { firstName: givenName, lastName: familyName };
  }
  const firstName = asCleanString(userInfo?.firstName);
  const lastName = asCleanString(userInfo?.lastName);
  if (firstName || lastName) {
    return { firstName, lastName };
  }
  return splitHumanName(userInfo?.name);
}

export async function backfillUserNameFromGoogle(db, userId, userInfo) {
  return backfillUserNameFromOAuth(db, userId, userInfo);
}

export async function backfillUserNameFromOAuth(db, userId, userInfo) {
  const { firstName, lastName } = resolveOAuthNameParts(userInfo);
  const email = asCleanString(userInfo?.email);

  await db.query(
    `UPDATE users
     SET email = COALESCE(NULLIF(?, ''), email),
         first_name = CASE
           WHEN first_name IS NULL OR first_name = '' THEN COALESCE(NULLIF(?, ''), first_name)
           ELSE first_name
         END,
         last_name = CASE
           WHEN last_name IS NULL OR last_name = '' THEN COALESCE(NULLIF(?, ''), last_name)
           ELSE last_name
         END
     WHERE id = ?`,
    [email, firstName, lastName, userId]
  );
}
