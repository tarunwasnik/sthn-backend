"use strict";
//backend/src/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const routes_1 = __importDefault(require("./routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
// API routes
app.use("/api", routes_1.default);
const PORT = process.env.PORT || 5000;
mongoose_1.default
    .connect(process.env.MONGO_URI)
    .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})
    .catch((err) => {
    console.error("MongoDB connection error:", err);
});
