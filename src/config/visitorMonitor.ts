/** Development-only visitor intelligence.  Both switches deliberately default to off. */
export interface VisitorMonitorConfig {
  enabled: boolean;
  adminReadEnabled: boolean;
  retentionDays: number;
  environment: "LOCALHOST" | "CADDY_LAN" | "VERCEL" | "OTHER";
}

const bool = (name: string) => process.env[name]?.trim().toLowerCase() === "true";
export const visitorMonitorConfig = (): VisitorMonitorConfig => ({
  enabled: bool("STHN_VISITOR_MONITOR_ENABLED"),
  adminReadEnabled: bool("STHN_VISITOR_MONITOR_ADMIN_READ_ENABLED"),
  retentionDays: Math.min(30, Math.max(1, Number.parseInt(process.env.STHN_VISITOR_MONITOR_RETENTION_DAYS || "7", 10) || 7)),
  environment: process.env.VERCEL === "1" ? "VERCEL" : process.env.STHN_LOCAL_DEV_ORIGIN ? "CADDY_LAN" : "LOCALHOST",
});
