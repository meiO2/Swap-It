export type BiteshipRate = {
  courier_code?: string;
  courier_name?: string;
  courier_service_code?: string;
  courier_service_name?: string;
  price?: number;
  duration?: string;
};

type BiteshipResponse = {
  pricing?: BiteshipRate[];
  success?: boolean;
  message?: string;
  error?: string;
  code?: number;
};

function getConfig() {
  const apiKey = process.env.BITESHIP_API_KEY;
  const baseUrl = process.env.BITESHIP_BASE_URL ?? "https://api.biteship.com";
  const originPostalCode = Number(process.env.BITESHIP_ORIGIN_POSTAL_CODE ?? "15339");
  if (!apiKey) throw new Error("BITESHIP_API_KEY is not configured.");
  if (!Number.isSafeInteger(originPostalCode)) {
    throw new Error("BITESHIP_ORIGIN_POSTAL_CODE is invalid.");
  }
  return { apiKey, baseUrl, originPostalCode };
}

export async function getShippingRates(input: {
  destinationPostalCode: string;
  couriers?: string;
  items: Array<{ name: string; price: number; quantity: number }>;
}) {
  const config = getConfig();
  const destinationPostalCode = Number(input.destinationPostalCode);
  if (!Number.isSafeInteger(destinationPostalCode)) {
    throw new Error("A valid destination postal code is required.");
  }

  const response = await fetch(`${config.baseUrl}/v1/rates/couriers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      origin_postal_code: config.originPostalCode,
      destination_postal_code: destinationPostalCode,
      couriers: input.couriers ?? "jne,sicepat,jnt",
      items: input.items.map((item) => ({
        name: item.name,
        description: item.name,
        value: item.price,
        quantity: item.quantity,
        weight: 1000,
        length: 20,
        width: 15,
        height: 10,
      })),
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as BiteshipResponse | null;
  if (!response.ok || !payload?.pricing) {
    const message = payload?.message ?? payload?.error ?? "Biteship could not provide shipping rates.";
    throw new Error(`Biteship rates request failed (${response.status}): ${message}`);
  }
  return payload.pricing.filter(
    (rate) => typeof rate.price === "number" && rate.price > 0 && rate.courier_code,
  );
}

export function getBiteshipCourierCode(value: string) {
  const codes: Record<string, string> = {
    "sicepat-reg": "sicepat",
    "jnt-express": "jnt",
    "jne-reg": "jne",
  };
  return codes[value] ?? value;
}
