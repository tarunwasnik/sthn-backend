"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUserProfileDto = void 0;
const toPublicUserProfileDto = (profile, calculateAge) => ({
    id: String(profile._id),
    username: profile.username,
    avatar: profile.avatar,
    cover: profile.cover,
    bio: profile.bio,
    interests: profile.interests ?? [],
    country: profile.country ?? null,
    city: profile.city ?? null,
    languages: profile.languages ?? [],
    profilePhotos: profile.profilePhotos ?? [],
    age: profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null,
});
exports.toPublicUserProfileDto = toPublicUserProfileDto;
