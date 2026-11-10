import { connectDB } from "@/lib/mongodb";
import { swapHubs as mockSwapHubs } from "@/data/mock";
import SwapHub from "@/models/SwapHub";

export type SwapHub = {
  id: string;
  name: string;
  address: string;
  distance: string;
  position: [number, number];
  openingHours: string;
};

export const swapHubs: SwapHub[] = mockSwapHubs;

export async function getSwapHubs() {
  await connectDB();
  if (process.env.SEED_DEMO_DATA === "true") {
    await SwapHub.bulkWrite(
      mockSwapHubs.map((hub) => ({
        updateOne: {
          filter: { hubId: hub.id },
          update: { $setOnInsert: { hubId: hub.id, name: hub.name, address: hub.address, distance: hub.distance, position: hub.position, openingHours: hub.openingHours, isActive: true } },
          upsert: true,
        },
      })),
    );
  }
  const hubs = await SwapHub.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  return hubs.map((hub) => ({
    id: hub.hubId,
    name: hub.name,
    address: hub.address,
    distance: hub.distance,
    position: hub.position,
    openingHours: hub.openingHours,
  }));
}
