export interface PublicUserProfileDto {
  id: string;
  username: string;
  avatar: string;
  cover: string;
  bio: string;
  interests: string[];
  country: string | null;
  city: string | null;
  languages: string[];
  profilePhotos: string[];
  age: number | null;
}

type PublicUserProfileSource = {
  _id: unknown;
  username: string;
  dateOfBirth?: Date | null;
  avatar: string;
  cover: string;
  bio: string;
  interests?: string[];
  country?: string | null;
  city?: string | null;
  languages?: string[];
  profilePhotos?: string[];
};

export const toPublicUserProfileDto = (
  profile: PublicUserProfileSource,
  calculateAge: (dateOfBirth: Date) => number,
): PublicUserProfileDto => ({
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
