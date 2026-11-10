import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import cloudinary from "@/lib/cloudinary";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 8;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function uploadToCloudinary(file: File): Promise<{ publicId: string; url: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "swapit",
        public_id: randomUUID(),
        resource_type: "image",
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url || !result.public_id) {
          reject(new Error("Cloudinary did not return an image URL."));
          return;
        }

        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );

    void file.arrayBuffer().then((data) => stream.end(Buffer.from(data)), reject);
  });
}

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

    const imageFiles: File[] = [];
    for (const entry of files) {
      if (!(entry instanceof File)) {
        return NextResponse.json(
          { success: false, message: "Each upload must be an image file." },
          { status: 400 },
        );
      }

      if (!IMAGE_TYPES.has(entry.type)) {
        return NextResponse.json(
          { success: false, message: "Only JPEG, PNG, and WebP images are supported." },
          { status: 400 },
        );
      }

      if (entry.size < 1 || entry.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, message: "Each image must be no larger than 5 MB." },
          { status: 400 },
        );
      }

      imageFiles.push(entry);
    }

    const uploadedImages: Array<{ publicId: string; url: string }> = [];
    try {
      for (const file of imageFiles) {
        uploadedImages.push(await uploadToCloudinary(file));
      }
    } catch (error) {
      const cleanupResults = await Promise.allSettled(
        uploadedImages.map((image) => cloudinary.uploader.destroy(image.publicId)),
      );
      for (const result of cleanupResults) {
        if (result.status === "rejected") {
          console.error("Cloudinary upload cleanup error:", result.reason);
        }
      }
      throw error;
    }

    return NextResponse.json(
      { success: true, data: uploadedImages.map((image) => image.url) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload images to Cloudinary error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to upload images." },
      { status: 500 },
    );
  }
}
