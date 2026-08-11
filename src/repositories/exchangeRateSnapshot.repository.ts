import { ClientSession } from "mongoose";

import {
  ExchangeRateSnapshot,
  ExchangeRateSnapshotDocument,
} from "../models/exchangeRateSnapshot.model";
import { ExchangeRateSnapshotStatus } from
  "../enums/financial/exchangeRateSnapshotStatus.enum";
import { SupportedCurrency } from
  "../constants/financial/supportedCurrencies";

type SnapshotCreation = Omit<ExchangeRateSnapshotDocument,
  keyof Document | "_id" | "createdAt" | "updatedAt" | "supersededAt" |
  "supersededByReference">;

export class ExchangeRateSnapshotRepository {
  findByReference(reference: string, session?: ClientSession) {
    return ExchangeRateSnapshot.findOne({ snapshotReference: reference })
      .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
      .session(session ?? null).exec();
  }

  findByKey(snapshotKey: string, session?: ClientSession) {
    return ExchangeRateSnapshot.findOne({ snapshotKey })
      .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
      .session(session ?? null).exec();
  }

  findCurrentPair(provider: string, baseCurrency: SupportedCurrency,
    quoteCurrency: SupportedCurrency, session?: ClientSession) {
    return ExchangeRateSnapshot.findOne({ provider, baseCurrency,
      quoteCurrency, status: ExchangeRateSnapshotStatus.ACTIVE })
      .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
      .session(session ?? null).exec();
  }

  findLatestValidPair(provider: string, baseCurrency: SupportedCurrency,
    quoteCurrency: SupportedCurrency, now: Date) {
    return ExchangeRateSnapshot.findOne({ provider, baseCurrency,
      quoteCurrency, status: ExchangeRateSnapshotStatus.ACTIVE,
      validFrom: { $lte: now }, expiresAt: { $gt: now } })
      .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
      .exec();
  }

  async create(data: SnapshotCreation, session: ClientSession) {
    const [created] = await ExchangeRateSnapshot.create([data], { session });
    return created;
  }

  supersedeActive(reference: string, supersededByReference: string,
    supersededAt: Date, session: ClientSession) {
    return ExchangeRateSnapshot.findOneAndUpdate({
      snapshotReference: reference,
      status: ExchangeRateSnapshotStatus.ACTIVE,
    }, { $set: {
      status: ExchangeRateSnapshotStatus.SUPERSEDED,
      supersededAt,
      supersededByReference,
    } }, { new: true, session, runValidators: true }).exec();
  }

  list(provider: string, baseCurrency: SupportedCurrency,
    quoteCurrency: SupportedCurrency, limit = 100) {
    return ExchangeRateSnapshot.find({ provider, baseCurrency, quoteCurrency })
      .sort({ effectiveDate: -1, createdAt: -1 }).limit(limit).exec();
  }
}

export const exchangeRateSnapshotRepository =
  new ExchangeRateSnapshotRepository();
