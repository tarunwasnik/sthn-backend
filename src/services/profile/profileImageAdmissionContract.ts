export type ProfileMediaClaim = Readonly<{ kind: "UNCHANGED"; reference: string } | { kind: "ADMISSION"; admissionReference: string }>;
export type ProfileMediaAdmissionRequest = Readonly<{ avatar?: ProfileMediaClaim; cover?: ProfileMediaClaim; profilePhotos?: readonly ProfileMediaClaim[] }>;

const forbidden = new Set(["assetId", "contentSha256", "pendingBinding", "destinationBinding", "trustedMediaReference", "providerAssetId"]);
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 2048;
const rejectInternal = (value: unknown): void => { if (!plain(value)) return; for (const [key, nested] of Object.entries(value)) { if (forbidden.has(key)) throw new Error("Image admission request contains forbidden internal metadata"); rejectInternal(nested); } };
export const parseProfileMediaClaim = (value: unknown, field: string): ProfileMediaClaim => {
  if (!plain(value) || Object.keys(value).length !== 2 && Object.keys(value).length !== 1 || typeof value.kind !== "string") throw new Error(`Invalid ${field} media claim`);
  if (value.kind === "UNCHANGED" && nonEmpty(value.reference) && Object.keys(value).every((key) => key === "kind" || key === "reference")) return { kind: "UNCHANGED", reference: value.reference as string };
  if (value.kind === "ADMISSION" && typeof value.admissionReference === "string" && /^imauth_[A-Za-z0-9_-]{1,80}$/.test(value.admissionReference) && Object.keys(value).every((key) => key === "kind" || key === "admissionReference")) return { kind: "ADMISSION", admissionReference: value.admissionReference };
  throw new Error(`Invalid ${field} media claim`);
};
export const parseProfileMediaAdmissionRequest = (input: unknown): ProfileMediaAdmissionRequest => {
  if (!plain(input)) throw new Error("Invalid image admission request"); rejectInternal(input);
  const result: { avatar?: ProfileMediaClaim; cover?: ProfileMediaClaim; profilePhotos?: ProfileMediaClaim[] } = {};
  for (const field of ["avatar", "cover"] as const) if (input[field] !== undefined) result[field] = parseProfileMediaClaim(input[field], field);
  if (input.profilePhotos !== undefined) { if (!Array.isArray(input.profilePhotos) || input.profilePhotos.length < 2 || input.profilePhotos.length > 6) throw new Error("Invalid profilePhotos media claims"); result.profilePhotos = input.profilePhotos.map((item, index) => parseProfileMediaClaim(item, `profilePhotos[${index}]`)); const keys = result.profilePhotos.map((item) => item.kind === "UNCHANGED" ? `u:${item.reference}` : `a:${item.admissionReference}`); if (new Set(keys).size !== keys.length) throw new Error("Duplicate profile media claims are not allowed"); }
  return result;
};
