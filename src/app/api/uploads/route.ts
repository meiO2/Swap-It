import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 8;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    const formData = await request.formData();
    const files = formData.getAll("images");

    if (files.length < 1 || files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, message: `Upload between 1 and ${MAX_FILES} images.` },
        { status: 400 },
      );
    }

    const uploadDirectory = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDirectory, { recursive: true });

    const imageUrls: string[] = [];
    for (const entry of files) {
      if (!(entry instanceof File)) {
        return NextResponse.json(
          { success: false, message: "Each upload must be an image file." },
          { status: 400 },
        );
      }

      const extension = IMAGE_TYPES.get(entry.type);
      if (!extension) {
        return NextResponse.json(
          { success: false, message: "Only JPEG, PNG, and WebP images are supported." },
          { status: 400 },
        );
      }

      if (entry.size < 1 || entry.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, message: "Each image must be smaller than 5 MB." },
          { status: 400 },
        );
      }

      const filename = `${auth.user.id}-${randomUUID()}.${extension}`;
      await writeFile(
        path.join(uploadDirectory, filename),
        Buffer.from(await entry.arrayBuffer()),
        { flag: "wx" },
      );
      imageUrls.push(`/uploads/${filename}`);
    }

    return NextResponse.json({ success: true, data: imageUrls }, { status: 201 });
  } catch (error) {
    console.error("Upload product images error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to upload product images." },
      { status: 500 },
    );
  }
}
