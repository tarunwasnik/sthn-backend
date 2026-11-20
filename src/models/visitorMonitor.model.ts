import mongoose, { Schema } from "mongoose";

export interface VisitorMonitorSessionDocument {
  visitorId: string; accountId?: mongoose.Types.ObjectId; role?: string; firstSeenAt: Date; lastSeenAt: Date; expiresAt: Date;
  device?: Record<string, unknown>; network?: Record<string, unknown>; environment: string; lastRoute?: string; eventCount: number;
}
const sessionSchema = new Schema<VisitorMonitorSessionDocument>({
  visitorId: { type: String, required: true, unique: true, maxlength: 96 }, accountId: { type: Schema.Types.ObjectId, ref: "User", index: true }, role: { type: String },
  firstSeenAt: { type: Date, required: true }, lastSeenAt: { type: Date, required: true, index: true }, expiresAt: { type: Date, required: true },
  device: { type: Schema.Types.Mixed }, network: { type: Schema.Types.Mixed }, environment: { type: String, required: true, index: true }, lastRoute: { type: String, maxlength: 240 }, eventCount: { type: Number, required: true, default: 0 },
}, { versionKey: false });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ lastSeenAt: -1, environment: 1 });

export interface VisitorMonitorEventDocument { visitorId: string; accountId?: mongoose.Types.ObjectId; type: string; route?: string; occurredAt: Date; expiresAt: Date; data?: Record<string, unknown>; }
const eventSchema = new Schema<VisitorMonitorEventDocument>({
  visitorId: { type: String, required: true, index: true }, accountId: { type: Schema.Types.ObjectId, ref: "User", index: true }, type: { type: String, required: true, maxlength: 48 }, route: { type: String, maxlength: 240 }, occurredAt: { type: Date, required: true, index: true }, expiresAt: { type: Date, required: true }, data: { type: Schema.Types.Mixed },
}, { versionKey: false });
eventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
eventSchema.index({ visitorId: 1, occurredAt: -1 });

export const VisitorMonitorSession = mongoose.model<VisitorMonitorSessionDocument>("VisitorMonitorSession", sessionSchema);
export const VisitorMonitorEvent = mongoose.model<VisitorMonitorEventDocument>("VisitorMonitorEvent", eventSchema);
