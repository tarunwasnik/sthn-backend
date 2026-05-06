//backend/src/utils/extractPublicId.ts

export const extractPublicId = (url: string): string | null => {
  try {
    if (!url) return null;

    const parts = url.split("/");

    // Get last part (filename)
    const fileWithExtension = parts[parts.length - 1];

    // Remove extension
    const fileName = fileWithExtension.split(".")[0];

    // Handle folders inside Cloudinary (VERY IMPORTANT)
    // Example:
    // https://res.cloudinary.com/.../image/upload/v12345/user_profiles/abc123.jpg
    // → publicId = user_profiles/abc123

    const uploadIndex = parts.findIndex((p) => p === "upload");

    if (uploadIndex === -1) return fileName;

    const publicIdParts = parts.slice(uploadIndex + 2); // skip 'upload' + version

    const fullPath = publicIdParts.join("/").split(".")[0];

    return fullPath;
  } catch (error) {
    return null;
  }
};