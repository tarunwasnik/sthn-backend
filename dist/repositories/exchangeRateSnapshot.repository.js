"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeRateSnapshotRepository = exports.ExchangeRateSnapshotRepository = void 0;
const exchangeRateSnapshot_model_1 = require("../models/exchangeRateSnapshot.model");
const exchangeRateSnapshotStatus_enum_1 = require("../enums/financial/exchangeRateSnapshotStatus.enum");
class ExchangeRateSnapshotRepository {
    findByReference(reference, session) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({ snapshotReference: reference })
            .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
            .session(session ?? null).exec();
    }
    findByKey(snapshotKey, session) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({ snapshotKey })
            .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
            .session(session ?? null).exec();
    }
    findCurrentPair(provider, baseCurrency, quoteCurrency, session) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({ provider, baseCurrency,
            quoteCurrency, status: exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE })
            .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
            .session(session ?? null).exec();
    }
    findLatestValidPair(provider, baseCurrency, quoteCurrency, now) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({ provider, baseCurrency,
            quoteCurrency, status: exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE,
            validFrom: { $lte: now }, expiresAt: { $gt: now } })
            .select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
            .exec();
    }
    async create(data, session) {
        const [created] = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.create([data], { session });
        return created;
    }
    supersedeActive(reference, supersededByReference, supersededAt, session) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOneAndUpdate({
            snapshotReference: reference,
            status: exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE,
        }, { $set: {
                status: exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.SUPERSEDED,
                supersededAt,
                supersededByReference,
            } }, { new: true, session, runValidators: true }).exec();
    }
    list(provider, baseCurrency, quoteCurrency, limit = 100) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({ provider, baseCurrency, quoteCurrency })
            .sort({ effectiveDate: -1, createdAt: -1 }).limit(limit).exec();
    }
    listCurrent(provider) {
        return exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({ provider,
            status: exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE })
            .sort({ baseCurrency: 1, quoteCurrency: 1, createdAt: -1 }).exec();
    }
}
exports.ExchangeRateSnapshotRepository = ExchangeRateSnapshotRepository;
exports.exchangeRateSnapshotRepository = new ExchangeRateSnapshotRepository();
