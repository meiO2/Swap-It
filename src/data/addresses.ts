export type SavedAddress = {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
};

export const savedAddresses: SavedAddress[] = [
  {
    id: "home",
    name: "Drew",
    phone: "+62 812-3456-7890",
    address: "Jl. Boulevard BSD Timur No. 8",
    city: "Tangerang Selatan",
    postalCode: "15310",
  },
  {
    id: "office",
    name: "Drew",
    phone: "+62 812-3456-7890",
    address: "Green Office Park 9, BSD Green Office Park",
    city: "Tangerang",
    postalCode: "15345",
  },
];
