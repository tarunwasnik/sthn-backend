export type SourceBox = readonly [number, number, number, number];
export const projectG8FSourceBox = (box: SourceBox, sourceWidth: number, sourceHeight: number) => {
  const [x, y, width, height] = box;
  return { leftPercent: 100 * x / sourceWidth, topPercent: 100 * y / sourceHeight, widthPercent: 100 * width / sourceWidth, heightPercent: 100 * height / sourceHeight };
};
export const withinG8FContent = (projection: ReturnType<typeof projectG8FSourceBox>) => projection.leftPercent >= 0 && projection.topPercent >= 0 && projection.leftPercent + projection.widthPercent <= 100 && projection.topPercent + projection.heightPercent <= 100;
export const readableG8FLabel = (value: string) => value.split("_").map(word => word[0] + word.slice(1).toLowerCase()).join(" ");
