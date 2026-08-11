import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { platformRevenueService } from "../../services/financial/platformRevenue.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

before(async()=>{process.env.NODE_ENV="test";await connectPhase7HDatabase();});
after(async()=>{await disconnectPhase7HDatabase();});
test("platform revenue counts only recognized Ledger revenue by currency",async()=>{await clearPhase7HDatabase();const rows=[[LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE,MoneyDirection.CREDIT,5000,"USD"],[LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE,MoneyDirection.CREDIT,20000,"USD"],[LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE,MoneyDirection.CREDIT,1000,"INR"],[LedgerAccount.PLATFORM_ESCROW,MoneyDirection.CREDIT,105000,"USD"],[LedgerAccount.CREATOR_PAYABLE,MoneyDirection.CREDIT,80000,"USD"],[LedgerAccount.WALLET_AVAILABLE,MoneyDirection.CREDIT,80000,"USD"],[LedgerAccount.PLATFORM_COMMISSION_PAYABLE,MoneyDirection.CREDIT,20000,"USD"]] as const;for(const [account,direction,amount,currency] of rows)await LedgerEntry.create({ledgerReference:`rev-${account}-${currency}`,transactionId:`t-${account}-${currency}`,type:LedgerEntryType.BOOKING_ESCROW_ALLOCATED,source:LedgerSource.BOOKING_ESCROW_ALLOCATION,account,direction,amount,currency});const summary=await platformRevenueService.summary();assert.deepEqual(summary.currencies,[{currency:"INR",customerPlatformFeeRevenue:1000,creatorCommissionRevenue:0,totalPlatformRevenue:1000},{currency:"USD",customerPlatformFeeRevenue:5000,creatorCommissionRevenue:20000,totalPlatformRevenue:25000}]);const entries=await platformRevenueService.entries({});assert.equal(entries.items.length,3);for(const x of entries.items){assert.ok(Object.keys(x).every(key=>["bookingReference","paymentReference","category","currency","amount","recognizedAt"].includes(key)));if(x.bookingReference!==undefined)assert.equal(typeof x.bookingReference,"string");if(x.paymentReference!==undefined)assert.equal(typeof x.paymentReference,"string");}});
