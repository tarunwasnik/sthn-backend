"use strict";
//backend/src/utils/generateCreatorSlug.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueCreatorSlug = void 0;
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const generateBaseSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
};
const generateUniqueCreatorSlug = async (displayName) => {
    const baseSlug = generateBaseSlug(displayName);
    let slug = baseSlug;
    let counter = 2;
    while (await creatorProfile_model_1.CreatorProfile.exists({ slug })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return slug;
};
exports.generateUniqueCreatorSlug = generateUniqueCreatorSlug;
