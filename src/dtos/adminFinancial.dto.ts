const date = (v: any) => v ? new Date(v) : undefined;
export const paymentDto = (v: any) => v && ({ paymentReference:v.paymentReference, bookingId:v.bookingId?.toString(), userId:v.userId?.toString(), creatorId:v.creatorId?.toString(), status:v.status, amount:v.amount, currency:v.currency, serviceAmount:v.serviceAmount, customerFeeAmount:v.customerFeeAmount, provider:v.provider, providerReference:v.providerPaymentId, escrowRecognized:Boolean(v.escrowRecognizedAt), createdAt:date(v.createdAt), updatedAt:date(v.updatedAt) });
export const paymentFinancialDetailDto = (value: any) => value && ({
  payment: paymentDto(value.payment),
  booking: value.booking && {
    bookingReference: value.booking.bookingReference,
    status: value.booking.status,
    paymentMethod: value.booking.paymentMethod,
    completedAt: date(value.booking.completedAt),
    settlementEligibleAt: date(value.booking.settlementEligibleAt),
  },
  reservation: value.reservation && {
    reservationReference: value.reservation.reservationReference,
    status: value.reservation.status,
    amount: value.reservation.amount,
    currency: value.reservation.currency,
    authorizedAt: date(value.reservation.authorizedAt),
    releasedAt: date(value.reservation.releasedAt),
    releaseReference: value.reservation.releaseReference,
    releaseCause: value.reservation.releaseCause,
    capturedAt: date(value.reservation.capturedAt),
    captureReference: value.reservation.captureReference,
    captureCause: value.reservation.captureCause,
  },
  escrow: value.escrow && {
    allocationReference: value.escrow.allocationReference,
    status: value.escrow.status,
    allocatedAt: date(value.escrow.allocatedAt),
  },
  settlement: value.settlement && {
    settlementReference: value.settlement.settlementReference,
    status: value.settlement.status,
    settledAt: date(value.settlement.settledAt),
  },
});
export const refundDto = (v: any) => v && ({ refundReference:v.refundReference, paymentId:v.paymentId?.toString(), bookingId:v.bookingId?.toString(), status:v.status, amount:v.amount, currency:v.currency, provider:v.provider, providerReference:v.providerRefundId, reason:v.reason, createdAt:date(v.createdAt), updatedAt:date(v.updatedAt) });
export const settlementDto = (v: any) => v && ({ settlementReference:v.settlementReference, bookingId:v.bookingId?.toString(), paymentId:v.paymentId?.toString(), creatorId:v.creatorId?.toString(), status:v.status, amount:v.amount, currency:v.currency, serviceAmount:v.serviceAmount, customerFeeAmount:v.customerFeeAmount, creatorNetAmount:v.creatorNetAmount, platformCommissionAmount:v.platformCommissionAmount, settlementEligibleAt:date(v.settlementEligibleAt), settledAt:date(v.settledAt), ledgerTransactionReference:v.ledgerTransactionReference, createdAt:date(v.createdAt), updatedAt:date(v.updatedAt) });
export const creatorBalanceDto = (v: any) => v && ({ projectionType:"CREATOR_BALANCE", sourceOfTruth:"IMMUTABLE_LEDGER", creatorId:v.creatorId?.toString(), currency:v.currency, availableBalance:v.availableBalance, reservedBalance:v.reservedBalance, lockedBalance:v.lockedBalance, updatedAt:date(v.updatedAt), lastCalculatedAt:date(v.lastCalculatedAt) });
export const withdrawalDto = (v: any) => v && ({ withdrawalReference:v.withdrawalReference, creatorId:v.creatorId?.toString(), amount:v.amount, currency:v.currency, status:v.status, isActiveObligation:v.isActiveObligation, destinationReference:v.destinationSnapshot?.destinationReference, destinationType:v.destinationSnapshot?.type, maskedDestination:v.destinationSnapshot?.maskedIdentifier, payoutId:v.payoutId?.toString(), createdAt:date(v.createdAt), updatedAt:date(v.updatedAt), processingAt:date(v.processingAt), completedAt:date(v.completedAt), failedAt:date(v.failedAt) });
export const payoutDto = (v: any) => v && ({ payoutReference:v.payoutReference, withdrawalId:v.withdrawalId?.toString(), creatorId:v.creatorId?.toString(), amount:v.amount, currency:v.currency, status:v.status, provider:v.provider, providerReference:v.providerPayoutId, createdAt:date(v.createdAt), updatedAt:date(v.updatedAt), completedAt:date(v.completedAt), failedAt:date(v.failedAt) });
export const overviewDto = (v: any) => ({ paymentsByStatus:v.payments ?? [], refundsByStatus:v.refunds ?? [], settlementsByStatus:v.settlements ?? [], withdrawalsByStatus:v.withdrawals ?? [], payoutsByStatus:v.payouts ?? [], creatorBalancesByCurrency:(v.creatorBalanceProjectionByCurrency ?? []).map((x:any)=>({ currency:x._id, availableBalance:x.available, reservedBalance:x.reserved, lockedBalance:x.locked })) });
export const paginatedDto = <T>(result:any, map:(value:any)=>T) => ({ items:(result.items ?? []).map(map), pagination:result.pagination });
