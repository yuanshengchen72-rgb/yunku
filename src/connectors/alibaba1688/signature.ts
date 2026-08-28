import { createHmac } from "node:crypto";

export type AlibabaParameterValue = string | number | boolean | null | undefined;
export type AlibabaParameters = Record<string, AlibabaParameterValue>;

function normalizedEntries(parameters: AlibabaParameters) {
  return Object.entries(parameters)
    .filter(([key, value]) => key !== "_aop_signature" && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right, "en"));
}

export function createAlibabaParameterSignature(
  parameters: AlibabaParameters,
  appSecret: string
): string {
  const factor = normalizedEntries(parameters)
    .map(([key, value]) => `${key}${value}`)
    .join("");

  return createHmac("sha1", appSecret).update(factor, "utf8").digest("hex").toUpperCase();
}

export function createAlibabaApiSignature(
  urlPath: string,
  parameters: AlibabaParameters,
  appSecret: string
): string {
  const factor = normalizedEntries(parameters)
    .map(([key, value]) => `${key}${value}`)
    .join("");

  return createHmac("sha1", appSecret)
    .update(`${urlPath}${factor}`, "utf8")
    .digest("hex")
    .toUpperCase();
}

export function toFormData(parameters: AlibabaParameters): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of normalizedEntries(parameters)) {
    form.set(key, value);
  }
  return form;
}
