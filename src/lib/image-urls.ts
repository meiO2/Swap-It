export function isUploadedImageUrl(value: string): boolean {
  if (value.startsWith("/uploads/")) return true;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      !url.username &&
      !url.password &&
      /^\/[^/]+\/image\/upload\/.+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
