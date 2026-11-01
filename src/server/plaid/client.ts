/**
 * Singleton Plaid API client.
 *
 * Reads credentials and environment from process.env. Lazily instantiated
 * so missing env vars surface only when the client is actually used (which
 * is helpful during build / static analysis).
 */
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

type PlaidEnv = "sandbox" | "development" | "production";

let cached: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (cached) return cached;

  const env = (process.env.PLAID_ENV ?? "sandbox") as PlaidEnv;
  const basePath = PlaidEnvironments[env];
  if (!basePath) {
    throw new Error(
      `Invalid PLAID_ENV "${env}". Expected one of: sandbox, development, production.`
    );
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error(
      "PLAID_CLIENT_ID and PLAID_SECRET must be set. See .env.example."
    );
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
        "Plaid-Version": "2020-09-14",
      },
    },
  });

  cached = new PlaidApi(configuration);
  return cached;
}
