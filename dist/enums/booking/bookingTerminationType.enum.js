"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingTerminationActorType = exports.BookingTerminationType = void 0;
var BookingTerminationType;
(function (BookingTerminationType) {
    BookingTerminationType["CUSTOMER_CANCELLED"] = "CUSTOMER_CANCELLED";
    BookingTerminationType["CREATOR_REJECTED"] = "CREATOR_REJECTED";
    BookingTerminationType["CREATOR_CANCELLED"] = "CREATOR_CANCELLED";
    BookingTerminationType["BOOKING_EXPIRED"] = "BOOKING_EXPIRED";
    BookingTerminationType["ADMIN_CANCELLED"] = "ADMIN_CANCELLED";
    BookingTerminationType["GOVERNANCE_TERMINATED"] = "GOVERNANCE_TERMINATED";
    BookingTerminationType["SYSTEM_TERMINATED"] = "SYSTEM_TERMINATED";
})(BookingTerminationType || (exports.BookingTerminationType = BookingTerminationType = {}));
var BookingTerminationActorType;
(function (BookingTerminationActorType) {
    BookingTerminationActorType["CUSTOMER"] = "CUSTOMER";
    BookingTerminationActorType["CREATOR"] = "CREATOR";
    BookingTerminationActorType["ADMIN"] = "ADMIN";
    BookingTerminationActorType["GOVERNANCE"] = "GOVERNANCE";
    BookingTerminationActorType["SYSTEM"] = "SYSTEM";
})(BookingTerminationActorType || (exports.BookingTerminationActorType = BookingTerminationActorType = {}));
