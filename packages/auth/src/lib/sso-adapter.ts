import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter, DBTransactionAdapter } from "@better-auth/core/db/adapter";
import { decryptSsoSecret, encryptSsoSecret, isEncrypted } from "@uni-status/shared/crypto";

type AdapterFactory<TOptions extends BetterAuthOptions> = (
  options: TOptions
) => DBAdapter<TOptions>;

const parseOidcConfig = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return null;
};

const encryptOidcConfig = async (value: unknown): Promise<unknown> => {
  const config = parseOidcConfig(value);
  if (!config) {
    return value;
  }

  const clientSecret = typeof config.clientSecret === "string" ? config.clientSecret : undefined;
  if (clientSecret) {
    config.clientSecretEncrypted = isEncrypted(clientSecret)
      ? clientSecret
      : await encryptSsoSecret(clientSecret);
    delete config.clientSecret;
  }

  return JSON.stringify(config);
};

const decryptOidcConfig = async (value: unknown): Promise<unknown> => {
  const config = parseOidcConfig(value);
  if (!config) {
    return value;
  }

  const clientSecretEncrypted =
    typeof config.clientSecretEncrypted === "string" ? config.clientSecretEncrypted : undefined;
  const clientSecret = typeof config.clientSecret === "string" ? config.clientSecret : undefined;

  if (!clientSecret && clientSecretEncrypted) {
    config.clientSecret = await decryptSsoSecret(clientSecretEncrypted);
  }

  return JSON.stringify(config);
};

const encryptSsoProviderData = async (data: Record<string, unknown>) => {
  if (!("oidcConfig" in data)) {
    return data;
  }

  return {
    ...data,
    oidcConfig: await encryptOidcConfig(data.oidcConfig),
  };
};

const decryptSsoProviderData = async (data: Record<string, unknown>) => {
  if (!("oidcConfig" in data)) {
    return data;
  }

  return {
    ...data,
    oidcConfig: await decryptOidcConfig(data.oidcConfig),
  };
};

const wrapAdapter = <
  TOptions extends BetterAuthOptions,
  TAdapter extends DBTransactionAdapter<TOptions>
>(
  adapter: TAdapter
): TAdapter => {
  return {
    ...adapter,
    create: async (data: Parameters<TAdapter["create"]>[0]) => {
      if (data.model !== "ssoProvider") {
        return adapter.create(data);
      }

      const encryptedData = await encryptSsoProviderData(
        data.data as Record<string, unknown>
      );
      return adapter.create({ ...data, data: encryptedData });
    },
    update: async (data: Parameters<TAdapter["update"]>[0]) => {
      if (data.model !== "ssoProvider") {
        return adapter.update(data);
      }

      const encryptedUpdate = await encryptSsoProviderData(
        data.update as Record<string, unknown>
      );
      return adapter.update({ ...data, update: encryptedUpdate });
    },
    updateMany: async (data: Parameters<TAdapter["updateMany"]>[0]) => {
      if (data.model !== "ssoProvider") {
        return adapter.updateMany(data);
      }

      const encryptedUpdate = await encryptSsoProviderData(
        data.update as Record<string, unknown>
      );
      return adapter.updateMany({ ...data, update: encryptedUpdate });
    },
    findOne: async (data: Parameters<TAdapter["findOne"]>[0]) => {
      const result = await adapter.findOne<Record<string, unknown> | null>(data);
      if (data.model !== "ssoProvider" || !result) {
        return result;
      }

      return decryptSsoProviderData(result);
    },
    findMany: async (data: Parameters<TAdapter["findMany"]>[0]) => {
      const result = await adapter.findMany<Record<string, unknown>>(data);
      if (data.model !== "ssoProvider" || result.length === 0) {
        return result;
      }

      return Promise.all(result.map((item: Record<string, unknown>) => decryptSsoProviderData(item)));
    },
  };
};

export const withSsoEncryption = <TOptions extends BetterAuthOptions>(
  adapterFactory: AdapterFactory<TOptions>
): AdapterFactory<TOptions> => {
  return (options: TOptions) => {
    const adapter = adapterFactory(options);

    return {
      ...wrapAdapter<TOptions, DBAdapter<TOptions>>(adapter),
      transaction: <R>(
        callback: (trx: DBTransactionAdapter<TOptions>) => Promise<R>
      ) =>
        adapter.transaction((trx) =>
          callback(wrapAdapter<TOptions, DBTransactionAdapter<TOptions>>(trx))
        ),
    };
  };
};
