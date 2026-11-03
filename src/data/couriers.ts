export type Courier = {
  id: string;
  name: string;
  badge: string;
  fee: number;
  minDays: number;
  maxDays: number;
  color: string;
};

export const couriers: Courier[] = [
  { id: "sicepat-reg", name: "SiCepat REG", badge: "S", fee: 15000, minDays: 2, maxDays: 3, color: "bg-danger/10 text-danger" },
  { id: "jnt-express", name: "J&T Express", badge: "J", fee: 17000, minDays: 2, maxDays: 3, color: "bg-warning/15 text-warning" },
  { id: "jne-reg", name: "JNE REG", badge: "J", fee: 18000, minDays: 3, maxDays: 4, color: "bg-info/15 text-info" },
];
