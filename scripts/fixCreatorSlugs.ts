import mongoose from "mongoose";
import { CreatorProfile } from "../src/models/creatorProfile.model";

const MONGO_URI = process.env.MONGO_URI || "";

const run = async () => {
  await mongoose.connect(MONGO_URI);

  const creators = await CreatorProfile.find({
    status: "active",
  });

  for (let i = 0; i < creators.length; i++) {
    const creator = creators[i];

    if (!creator.slug || creator.slug.trim() === "") {
      creator.slug = `creator-${creator._id.toString()}`;
      await creator.save();
      console.log("Updated slug for:", creator._id);
    }
  }

  console.log("Slug migration completed.");
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});