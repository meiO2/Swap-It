import { getShippingRates as getBiteshipRates } from "@/lib/biteship";

export type ShippingItem = {
  name: string;
  description?: string;
  weight?: number;
  quantity: number;
  value: number;
};

export type ShippingRate = {
  courier_code: string;
  courier_name: string;
  courier_service_code: string;
  courier_service_name: string;
  price: number;
  duration: string;
};

export type ShippingRequest = {
  originPostalCode?: string;
  destinationPostalCode: string;
  couriers?: string;
  items: ShippingItem[];
};

export class ShippingRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShippingRequestError";
  }
}

const MOCK_RATES: ShippingRate[] = [
  {
    courier_code: "jne",
    courier_name: "JNE",
    courier_service_code: "reg",
    courier_service_name: "REG",
    price: 18000,
    duration: "2-4 days",
  },
  {
    courier_code: "sicepat",
    courier_name: "SiCepat",
    courier_service_code: "reg",
    courier_service_name: "REG",
    price: 15000,
    duration: "2-3 days",
  },
  {
    courier_code: "jnt",
    courier_name: "J&T",
    courier_service_code: "ez",
    courier_service_name: "EZ",
    price: 17000,
    duration: "2-4 days",
  },
];

function getShippingMode() {
  const mode = (process.env.SHIPPING_MODE ?? "mock").toLowerCase();
  if (mode !== "mock" && mode !== "biteship") {
    throw new ShippingRequestError(`Invalid SHIPPING_MODE "${mode}". Use "mock" or "biteship".`);
  }
  return mode;
}

function validateRequest(input: ShippingRequest) {
  if (input.originPostalCode !== undefined && !/^\d{5}$/.test(input.originPostalCode)) {
    throw new ShippingRequestError("A valid five-digit origin postal code is required.");
  }
  if (!/^\d{5}$/.test(input.destinationPostalCode)) {
    throw new ShippingRequestError("A valid five-digit destination postal code is required.");
  }
  if (!Array.isArray(input.items) || !input.items.length) {
    throw new ShippingRequestError("At least one shipping item is required.");
  }
  if (input.items.some((item) =>
    !item ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    !Number.isSafeInteger(item.value) ||
    item.value < 1 ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    (item.weight !== undefined && (!Number.isSafeInteger(item.weight) || item.weight < 1)),
  )) {
    throw new ShippingRequestError("Shipping items must have valid name, value, quantity, and weight.");
  }
}

export async function getShippingRates(input: ShippingRequest): Promise<ShippingRate[]> {
  validateRequest(input);
  const mode = getShippingMode();

  if (mode === "mock") {
    const requestedCouriers = new Set((input.couriers ?? "jne,sicepat,jnt").split(",").map((code) => code.trim()));
    return MOCK_RATES.filter((rate) => requestedCouriers.has(rate.courier_code));
  }

  const rates = await getBiteshipRates({
    destinationPostalCode: input.destinationPostalCode,
    couriers: input.couriers,
    items: input.items.map((item) => ({
      name: item.name,
      price: item.value,
      quantity: item.quantity,
    })),
  });
  return rates.map((rate) => ({
    courier_code: rate.courier_code!,
    courier_name: rate.courier_name ?? rate.courier_code!,
    courier_service_code: rate.courier_service_code ?? "",
    courier_service_name: rate.courier_service_name ?? "",
    price: rate.price!,
    duration: rate.duration ?? "",
  }));
}
