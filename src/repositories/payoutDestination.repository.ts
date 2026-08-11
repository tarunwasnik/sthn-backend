import { ClientSession } from "mongoose";

import { IPayoutDestination, PayoutDestination } from "../models/payoutDestination.model";
import { PayoutDestinationType } from "../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../enums/financial/payoutDestinationVerificationStatus.enum";

export class PayoutDestinationRepository {
  async create(
    data: Partial<IPayoutDestination>,
    session?: ClientSession,
  ): Promise<IPayoutDestination> {
    if (!session) {
      return PayoutDestination.create(data);
    }

    const [destination] = await PayoutDestination.create([data], { session });
    return destination;
  }

  async findByCreatorAndIdempotencyKey(
    creatorId: string,
    idempotencyKey: string,
  ): Promise<IPayoutDestination | null> {
    return PayoutDestination.findOne({ creatorId, idempotencyKey })
      .select("+idempotencyKey +destinationFingerprint +requestFingerprint")
      .exec();
  }

  async findByCreatorTypeAndDestinationFingerprint(
    creatorId: string,
    type: PayoutDestinationType,
    destinationFingerprint: string,
  ): Promise<IPayoutDestination | null> {
    return PayoutDestination.findOne({ creatorId, type, destinationFingerprint })
      .select("+destinationFingerprint")
      .exec();
  }

  async findByCreatorAndReference(
    creatorId: string,
    destinationReference: string,
    session?: ClientSession,
  ): Promise<IPayoutDestination | null> {
    return PayoutDestination.findOne({ creatorId, destinationReference })
      .session(session ?? null)
      .exec();
  }

  async claimEligibleForWithdrawalBinding(
    creatorId: string,
    destinationReference: string,
    session: ClientSession,
  ): Promise<IPayoutDestination | null> {
    return PayoutDestination.findOneAndUpdate(
      {
        creatorId,
        destinationReference,
        verificationStatus: PayoutDestinationVerificationStatus.VERIFIED,
        isActive: true,
        verifiedAt: { $ne: null },
      },
      { $inc: { withdrawalBindingRevision: 1 } },
      { new: true, runValidators: true, session },
    )
      .select("+encryptedPayload +destinationFingerprint +withdrawalBindingRevision")
      .exec();
  }

  async findManyByCreator(creatorId: string): Promise<IPayoutDestination[]> {
    return PayoutDestination.find({ creatorId }).sort({ createdAt: -1 }).exec();
  }

  async findByReferenceForVerification(
    destinationReference: string,
    session?: ClientSession,
  ): Promise<IPayoutDestination | null> {
    return PayoutDestination.findOne({ destinationReference })
      .select("+verifiedBy +rejectedBy +rejectionCode +verificationNote")
      .session(session ?? null)
      .exec();
  }

  async transitionVerificationIfUnverified(
    destinationReference: string,
    expectedIsActive: boolean,
    update: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPayoutDestination | null> {
    return PayoutDestination.findOneAndUpdate(
      {
        destinationReference,
        verificationStatus: "UNVERIFIED",
        isActive: expectedIsActive,
      },
      update,
      { new: true, runValidators: true, session },
    )
      .select("+rejectionCode")
      .exec();
  }

  async setActiveIfCurrent(
    creatorId: string,
    destinationReference: string,
    isActive: boolean,
    update: Record<string, unknown>,
  ): Promise<IPayoutDestination | null> {
    const filter: Record<string, unknown> = {
      creatorId,
      destinationReference,
      isActive: !isActive,
    };

    if (isActive) {
      filter.verificationStatus = {
        $in: [
          PayoutDestinationVerificationStatus.UNVERIFIED,
          PayoutDestinationVerificationStatus.VERIFIED,
        ],
      };
    }

    return PayoutDestination.findOneAndUpdate(
      filter,
      update,
      { new: true, runValidators: true },
    ).exec();
  }
}

export const payoutDestinationRepository = new PayoutDestinationRepository();
