"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCompletionActorType = exports.BookingWalletCaptureCause = void 0;
var BookingWalletCaptureCause;
(function (BookingWalletCaptureCause) {
    BookingWalletCaptureCause["CREATOR_COMPLETED"] = "CREATOR_COMPLETED";
    BookingWalletCaptureCause["AUTO_COMPLETED"] = "AUTO_COMPLETED";
})(BookingWalletCaptureCause || (exports.BookingWalletCaptureCause = BookingWalletCaptureCause = {}));
var BookingCompletionActorType;
(function (BookingCompletionActorType) {
    BookingCompletionActorType["CREATOR"] = "CREATOR";
    BookingCompletionActorType["SYSTEM"] = "SYSTEM";
})(BookingCompletionActorType || (exports.BookingCompletionActorType = BookingCompletionActorType = {}));
