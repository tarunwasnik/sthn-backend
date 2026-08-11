import assert from "node:assert/strict";
import { test } from "node:test";

import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { Payment } from "../../../models/payment.model";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
} from "../phase7h/fixtures/topUpFixtures";

export const registerBookingPaymentMethodRegressionTests = () => {
  test("phase8a regression: Internal Provider booking still creates InternalPayment", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [200] });
    const server = await startBookingHttpServer();
    try {
      const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.token}`,
        },
        body: JSON.stringify({
          serviceId: fixture.serviceId.toString(),
          slotIds: fixture.slotIds.map(String),
          paymentMethod: PaymentMethod.INTERNAL,
        }),
      });
      const body = await response.json() as Record<string, any>;
      assert.equal(response.status, 201, JSON.stringify(body));
      const payment = await Payment.findOne({ bookingId: body.booking._id }).orFail();
      assert.equal(payment.method, PaymentMethod.INTERNAL);
      assert.equal(await InternalPaymentModel.countDocuments({ paymentId: payment._id }), 1);
      assert.equal(await BookingFundReservation.countDocuments({ paymentId: payment._id }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8a regression: top-up and Wallet booking lifecycle records remain separate", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 300);
    await completeFundedTopUp(request.topUpReference);
    assert.equal(await InternalTopUpFunding.countDocuments(), 1);
    assert.equal(await BookingFundReservation.countDocuments(), 0);

    const fixture = await createBookingWalletFixture({ walletAmount: 500, slotAmounts: [200] });
    const fundingCountBeforeBooking = await InternalTopUpFunding.countDocuments();
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(
        server.baseUrl,
        fixture,
        "phase8a-boundary",
      );
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(await BookingFundReservation.countDocuments(), 1);
      assert.equal(await InternalTopUpFunding.countDocuments(), fundingCountBeforeBooking);
    } finally {
      await server.close();
    }
  });
};
