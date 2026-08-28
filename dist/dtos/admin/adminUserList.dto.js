"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAdminUserListDto = void 0;
/** Deliberate list contract; newly-added User fields stay private by default. */
const toAdminUserListDto = (user) => ({
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status,
    creatorStatus: user.creatorStatus,
    createdAt: user.createdAt,
});
exports.toAdminUserListDto = toAdminUserListDto;
