export const cloudinaryConfig = () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
  apiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
  folder: process.env.CLOUDINARY_FOLDER?.trim() || 'vocab-mate/avatars',
  isConfigured: Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
    process.env.CLOUDINARY_API_KEY?.trim() &&
    process.env.CLOUDINARY_API_SECRET?.trim() &&
    !process.env.CLOUDINARY_API_KEY.includes('replace-with'),
  ),
});

export type ReturnTypeOfCloudinaryConfig = ReturnType<typeof cloudinaryConfig>;
