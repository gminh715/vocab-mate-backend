import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { CLOUDINARY_CONFIG } from '../../../config/config.module';
import type { ReturnTypeOfCloudinaryConfig } from '../../../config/cloudinary.config';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    @Inject(CLOUDINARY_CONFIG)
    private readonly config: ReturnTypeOfCloudinaryConfig,
  ) {
    if (this.config.isConfigured) {
      cloudinary.config({
        cloud_name: this.config.cloudName,
        api_key: this.config.apiKey,
        api_secret: this.config.apiSecret,
        secure: true,
      });
      this.logger.log('Cloudinary service initialized successfully');
    } else {
      this.logger.warn(
        'Cloudinary credentials are not configured or placeholder detected. Falling back to data URI storage until CLOUDINARY_* environment variables are set.',
      );
    }
  }

  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No image file buffer provided');
    }

    if (this.config.isConfigured) {
      try {
        const result = await new Promise<UploadApiResponse>(
          (resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: this.config.folder,
                transformation: [
                  { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                  { quality: 'auto', fetch_format: 'auto' },
                ],
              },
              (error, result) => {
                if (error || !result) {
                  const rejectionError =
                    error instanceof Error
                      ? error
                      : new Error(
                          typeof error === 'object' &&
                            error !== null &&
                            'message' in error &&
                            typeof (error as { message: unknown }).message ===
                              'string'
                            ? (error as { message: string }).message
                            : 'Upload to Cloudinary failed',
                        );
                  return reject(rejectionError);
                }
                resolve(result);
              },
            );
            uploadStream.end(file.buffer);
          },
        );

        return result.secure_url;
      } catch (error) {
        this.logger.error('Failed to upload image to Cloudinary', error);
        throw new InternalServerErrorException(
          'Failed to upload image to cloud storage',
        );
      }
    }

    // Fallback when Cloudinary credentials are not provided:
    // Store as data URI base64 so local avatar updating continues to function seamlessly.
    const mimeType = file.mimetype || 'image/jpeg';
    const base64 = file.buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
}
