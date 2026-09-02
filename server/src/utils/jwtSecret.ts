/**
 * JWT signing key. Fails fast in production instead of falling back to a shared, guessable
 * secret — with a fallback in place, anyone who knows it can mint tokens for any account.
 */
const DEV_FALLBACK = "dev_only_insecure_secret";

export function jwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Set it in the API host's environment variables and redeploy."
    );
  }
  return DEV_FALLBACK;
}

/** Call once at boot so a misconfigured deploy fails on start, not on the first login. */
export function assertJwtSecret(): void {
  const secret = jwtSecret();
  if (secret === DEV_FALLBACK) {
    console.warn(
      "[resumeAI] JWT_SECRET is not set — using an insecure development secret. " +
        "Set JWT_SECRET before deploying."
    );
  }
}
