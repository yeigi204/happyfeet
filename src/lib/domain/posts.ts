export const POST_LIMITS = {
  minImages: 1,
  maxImages: 10,
  maxImageBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxCaptionLength: 2000,
} as const;
