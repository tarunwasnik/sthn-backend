//backend/src/utils/generateCreatorSlug.ts

import { CreatorProfile } from "../models/creatorProfile.model";

const generateBaseSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
};

export const generateUniqueCreatorSlug = async (
  displayName: string
): Promise<string> => {
  const baseSlug = generateBaseSlug(displayName);

  let slug = baseSlug;
  let counter = 2;

  while (await CreatorProfile.exists({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};