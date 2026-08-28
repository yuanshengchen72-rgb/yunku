const OFFER_ID_PATTERN = /^\d{6,30}$/;

export class InvalidOfferReferenceError extends Error {
  constructor() {
    super("请输入有效的 1688 商品链接或 Offer ID");
    this.name = "InvalidOfferReferenceError";
  }
}

export function parseOfferId(reference: string): string {
  const input = reference.trim();
  if (OFFER_ID_PATTERN.test(input)) {
    return input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InvalidOfferReferenceError();
  }

  if (!/(^|\.)1688\.com$/i.test(url.hostname)) {
    throw new InvalidOfferReferenceError();
  }

  const pathMatch = url.pathname.match(/\/offer\/(\d{6,30})\.html/i);
  const queryId = url.searchParams.get("offerId") ?? url.searchParams.get("id");
  const offerId = pathMatch?.[1] ?? queryId ?? "";

  if (!OFFER_ID_PATTERN.test(offerId)) {
    throw new InvalidOfferReferenceError();
  }

  return offerId;
}
