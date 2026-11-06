import { connectDB } from "@/lib/mongodb";
import {
  chats,
  products,
  repairShops,
  revampProducts,
  swapNews,
} from "@/data/mock";
import MockChatSummary from "@/models/MockChatSummary";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import News from "@/models/News";
import Product from "@/models/Product";
import RepairShop from "@/models/RepairShop";
import RevampMerchandise from "@/models/RevampMerchandise";
import User from "@/models/User";
import mongoose from "mongoose";

function conditionToModel(condition: string) {
  if (condition === "Like new") return "LIKE_NEW" as const;
  if (condition === "Very good" || condition === "Good") return "GOOD" as const;
  return "FAIR" as const;
}

export async function ensureMockDataSeeded() {
  await connectDB();

  await Promise.all([
    RepairShop.bulkWrite(
      repairShops.map((shop) => ({
        updateOne: {
          filter: { shopId: shop.id },
          update: { $setOnInsert: { ...shop, shopId: shop.id, isActive: true } },
          upsert: true,
        },
      })),
    ),
    MockChatSummary.bulkWrite(
      chats.map((chat) => ({
        updateOne: {
          filter: { chatId: chat.id },
          update: { $setOnInsert: { ...chat, chatId: chat.id, isActive: true } },
          upsert: true,
        },
      })),
    ),
  ]);

  const seller = await User.findOne({ isActive: true }).select("_id").lean();
  if (!seller) return;

  await Promise.all([
    Product.bulkWrite(
      products.map((product) => ({
        updateOne: {
          filter: { name: product.name, sellerId: seller._id },
          update: {
            $setOnInsert: {
              mockId: product.id,
              sellerId: seller._id,
              name: product.name,
              description: `${product.condition} ${product.category.toLowerCase()} item from the SwapIt catalog.`,
              category: product.category,
              price: product.price,
              size: product.size,
              condition: conditionToModel(product.condition),
              images: [product.image],
              fulfillment: "Swap Hub drop-off",
              pickupChanges: 0,
              status: "AVAILABLE",
              publishedAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
    ),
    RevampMerchandise.bulkWrite(
      revampProducts.map((product) => ({
        updateOne: {
          filter: { name: product.name },
          update: {
            $setOnInsert: {
              name: product.name,
              category: product.category,
              size: product.size,
              condition: product.condition,
              description: `${product.condition} merchandise from SwapIt Revamp!`,
              price: product.price,
              image: product.image,
              status: "available",
              createdBy: seller._id,
            },
          },
          upsert: true,
        },
      })),
    ),
    News.bulkWrite(
      swapNews.map((item) => ({
        updateOne: {
          filter: { title: item.title },
          update: {
            $setOnInsert: {
              ...item,
              status: "published",
              authorId: seller._id,
            },
          },
          upsert: true,
        },
      })),
    ),
  ]);
}

export async function ensureMockConversationsSeeded(currentUserId: string) {
  await connectDB();
  const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);

  for (const chat of chats) {
    const mockUser = await User.findOneAndUpdate(
      { email: `mock.${chat.id}@swapit.local` },
      {
        $setOnInsert: {
          name: chat.name,
          email: `mock.${chat.id}@swapit.local`,
          passwordHash: "mock-seed-account-disabled",
          role: "CUSTOMER",
          avatarUrl: chat.avatar,
          isActive: true,
          emailVerifiedAt: new Date(),
          addresses: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).select("_id");

    if (!mockUser || mockUser._id.equals(currentUserObjectId)) continue;
    const participantIds = [currentUserObjectId, mockUser._id].sort((a, b) =>
      a.toString().localeCompare(b.toString()),
    );
    const participantKey = participantIds.map((id) => id.toString()).join("_");
    const conversation = await Conversation.findOneAndUpdate(
      { participantKey },
      {
        $setOnInsert: {
          participants: participantIds,
          participantKey,
          lastMessage: chat.lastMessage,
          lastMessageAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const hasMessages = await Message.exists({ conversationId: conversation._id });
    if (!hasMessages) {
      await Message.create({
        conversationId: conversation._id,
        senderId: mockUser._id,
        text: chat.lastMessage,
      });
    }
  }
}
