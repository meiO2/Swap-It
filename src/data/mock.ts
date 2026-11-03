export type Product = {
  id: string;
  name: string;
  category: string;
  size: string;
  condition: string;
  gpPrice: number;
  price: number;
  image: string;
  imageAlt: string;
  seller: string;
  distance: string;
};

export const products: Product[] = [
  {
    id: "linen-shirt",
    name: "Linen blend shirt",
    category: "Tops",
    size: "M",
    condition: "Like new",
    gpPrice: 125000,
    price: 125000,
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=720&q=85",
    imageAlt: "Light linen shirt on a hanger",
    seller: "Nadia Putri",
    distance: "2.3 km away",
  },
  {
    id: "denim-jacket",
    name: "Classic denim jacket",
    category: "Outerwear",
    size: "S",
    condition: "Very good",
    gpPrice: 210000,
    price: 210000,
    image: "https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=720&q=85",
    imageAlt: "Blue denim jacket styled on a person",
    seller: "Raka Aditya",
    distance: "1.8 km away",
  },
  {
    id: "canvas-tote",
    name: "Everyday canvas tote",
    category: "Accessories",
    size: "One size",
    condition: "Good",
    gpPrice: 65000,
    price: 65000,
    image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=720&q=85",
    imageAlt: "Natural canvas tote bag",
    seller: "Maya Sari",
    distance: "3.1 km away",
  },
  {
    id: "summer-dress",
    name: "Floral summer dress",
    category: "Dresses",
    size: "M",
    condition: "Like new",
    gpPrice: 180000,
    price: 180000,
    image: "https://images.unsplash.com/photo-1612336307429-8a898d10e223?auto=format&fit=crop&w=720&q=85",
    imageAlt: "Floral dress displayed on a model",
    seller: "Alya Rahman",
    distance: "4.6 km away",
  },
];

export type SwapHub = {
  id: string;
  name: string;
  address: string;
  distance: string;
  position: [number, number];
  openingHours: string;
};

export type RepairShop = {
  id: string;
  name: string;
  category: string;
  rating: number;
  distance: string;
  address: string;
  image: string;
};

export type ChatSummary = {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
};

export const swapHubs: SwapHub[] = [
  {
    id: "hub-bsd",
    name: "Swap Hub BSD",
    address: "BSD City, Tangerang",
    distance: "0.4 km",
    position: [-6.3025, 106.6526],
    openingHours: "Daily, 08:00–20:00",
  },
  {
    id: "hub-prasmul",
    name: "Swap Hub — Prasetiya Mulya",
    address: "Universitas Prasetiya Mulya, BSD",
    distance: "0.4 km",
    position: [-6.3025, 106.6526],
    openingHours: "Daily, 08:00–20:00",
  },
  {
    id: "hub-ice",
    name: "Swap Hub — ICE BSD",
    address: "Indonesia Convention Exhibition, BSD",
    distance: "2.1 km",
    position: [-6.3028, 106.6342],
    openingHours: "Daily, 10:00–21:00",
  },
  {
    id: "hub-qbig",
    name: "Swap Hub — QBig",
    address: "QBig BSD City, Sampora",
    distance: "3.6 km",
    position: [-6.3005, 106.6458],
    openingHours: "Daily, 10:00–22:00",
  },
];

export const repairShops: RepairShop[] = [
  {
    id: "benang-bercerita",
    name: "Benang Bercerita",
    category: "Alterations & tailoring",
    rating: 4.9,
    distance: "1.2 km",
    address: "Ruko Golden Madrid, BSD",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "jahit-kembali",
    name: "Jahit Kembali",
    category: "Repairs & denim",
    rating: 4.8,
    distance: "2.4 km",
    address: "Pasar Modern BSD, Tangerang",
    image: "https://images.unsplash.com/photo-1590736969955-71cc94901144?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "rumah-jahit",
    name: "Rumah Jahit Nia",
    category: "Custom tailoring",
    rating: 4.7,
    distance: "3.8 km",
    address: "Jl. Raya Serpong, BSD",
    image: "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=720&q=85",
  },
];

export const chats: ChatSummary[] = [
  {
    id: "nadia",
    name: "Nadia Putri",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80",
    lastMessage: "Yes, it’s still available!",
    time: "10:42",
    unread: 2,
  },
  {
    id: "raka",
    name: "Raka Aditya",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=128&q=80",
    lastMessage: "Would you like to swap?",
    time: "Yesterday",
    unread: 0,
  },
  {
    id: "maya",
    name: "Maya Sari",
    avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=128&q=80",
    lastMessage: "Thank you so much 🌿",
    time: "Mon",
    unread: 0,
  },
];

export type SwapNewsItem = {
  id: string;
  title: string;
  date: string;
  description: string;
  clothesDistributed: number;
  image: string;
};

export const swapNews: SwapNewsItem[] = [
  {
    id: "bsd-shelter",
    title: "A fresh start with the BSD community",
    date: "2026-10-12",
    description: "Our volunteers documented the handover of clean, ready-to-wear pieces to a local family support center.",
    clothesDistributed: 84,
    image: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=960&q=85",
  },
  {
    id: "school-drive",
    title: "Back-to-school wardrobe drive",
    date: "2026-09-24",
    description: "Community donations helped students choose everyday clothing for the new school term.",
    clothesDistributed: 126,
    image: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=960&q=85",
  },
  {
    id: "community-center",
    title: "Warm layers, shared locally",
    date: "2026-08-16",
    description: "A neighborhood distribution day connected donated clothing with nearby community members.",
    clothesDistributed: 63,
    image: "https://images.unsplash.com/photo-1494386346843-e12284507169?auto=format&fit=crop&w=960&q=85",
  },
];

export const revampProducts: Product[] = [
  {
    id: "revamp-pouch",
    name: "Patchwork utility pouch",
    category: "Upcycled accessories",
    size: "One size",
    condition: "Made from rescued textiles",
    gpPrice: 89000,
    price: 89000,
    image: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=720&q=85",
    imageAlt: "Handmade pouch made from colorful textile scraps",
    seller: "SwapIt Revamp!",
    distance: "Made in BSD",
  },
  {
    id: "revamp-tote",
    name: "Reworked denim tote",
    category: "Upcycled bags",
    size: "One size",
    condition: "Made from rescued textiles",
    gpPrice: 145000,
    price: 145000,
    image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=720&q=85",
    imageAlt: "Reworked casual fabric tote",
    seller: "SwapIt Revamp!",
    distance: "Made in BSD",
  },
];

export const catalogProducts = [...products, ...revampProducts];

export const swapItUser = {
  id: "maya-pramesti",
  name: "Maya Pramesti",
  memberSince: "March 2025",
  avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=256&q=80",
  qrValue: "SWAPIT-MAYA-7F3A",
};
