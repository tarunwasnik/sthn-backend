# Isolated local qualification image. It is not a production Dockerfile.
FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV STHN_LINUX_QUALIFICATION_CONTAINER=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY models/adamcodd-v2/model_int8.onnx ./models/adamcodd-v2/model_int8.onnx
COPY evaluation-cache/image-moderation/benchmark/collection-c ./evaluation-cache/image-moderation/benchmark/collection-c
COPY evaluation-output/image-moderation/i3b-5d-v2-memory-validation/full/validation-report.json ./evaluation-output/image-moderation/i3b-5d-v2-memory-validation/full/validation-report.json
# Immutable Stage I3A per-candidate V2 decisions used to validate the fixed smoke sample.
# Tensor caches are deliberately excluded: the qualification workers read only these JSON authorities.
COPY evaluation-output/image-moderation/i5-v2-preprocessing-compatibility/run-i3a-node-v2/*.json ./evaluation-output/image-moderation/i5-v2-preprocessing-compatibility/run-i3a-node-v2/
ENTRYPOINT ["node", "dist/scripts/runAdamCoddV2LinuxQualification.js"]
