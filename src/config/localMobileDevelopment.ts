const isPrivateIpv4 = (hostname: string): boolean => {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const values = parts.map(Number);
  if (values.some((value) => value < 0 || value > 255)) return false;
  return values[0] === 10
    || values[0] === 192 && values[1] === 168
    || values[0] === 172 && values[1] >= 16 && values[1] <= 31;
};

const readOptional = (environment: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = environment[name]?.trim();
  return value || undefined;
};

export interface LocalMobileDevelopmentConfig {
  readonly bindHost?: "127.0.0.1";
  readonly allowedOrigin?: string;
}

/**
 * Opt-in local-LAN settings for Caddy-terminated Android testing. Production
 * behavior remains unchanged when neither environment variable is supplied.
 */
export const readLocalMobileDevelopmentConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): LocalMobileDevelopmentConfig => {
  const bindHost = readOptional(environment, "STHN_BIND_HOST");
  if (bindHost !== undefined && bindHost !== "127.0.0.1") {
    throw new Error("STHN_BIND_HOST must be exactly 127.0.0.1 when configured");
  }

  const configuredOrigin = readOptional(environment, "STHN_LOCAL_DEV_ORIGIN");
  if (configuredOrigin === undefined) return bindHost ? { bindHost } : {};

  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new Error("STHN_LOCAL_DEV_ORIGIN must be a valid HTTPS origin");
  }
  if (
    origin.protocol !== "https:"
    || origin.port !== "8443"
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
    || !isPrivateIpv4(origin.hostname)
  ) {
    throw new Error("STHN_LOCAL_DEV_ORIGIN must be one private-IPv4 HTTPS origin on port 8443");
  }

  return { ...(bindHost ? { bindHost } : {}), allowedOrigin: origin.origin };
};
