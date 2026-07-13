import { Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MediaItem } from './entities/media-item.entity';
import { UploadGateway } from './upload.gateway';

const PHOTOS_API_BASE = 'https://photoslibrary.googleapis.com/v1';

let uploadQueue: Promise<unknown> = Promise.resolve();

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectRepository(MediaItem)
    private mediaItemRepo: Repository<MediaItem>,
    private configService: ConfigService,
    private uploadGateway: UploadGateway,
  ) { }

  private getApiBaseUrl(): string {
    const port = this.configService.get<string>('PORT') || '5000';
    return this.configService.get<string>('API_PUBLIC_URL') || `http://localhost:${port}`;
  }

  private buildThumbnailUrl(baseUrl: string, size = 'w400-h400-c'): string {
    return `${baseUrl}=${size}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildProductUrl(mediaItemId: string): string {
    return `https://photos.google.com/lr/photo/${mediaItemId}`;
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-() ]/g, '_').slice(0, 200) || 'photo.jpg';
  }

  private async googleFetch(
    accessToken: string,
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  }

  /** Bước 1: Upload bytes lên Google → nhận uploadToken */
  private async uploadBytes(
    file: Express.Multer.File,
    accessToken: string,
  ): Promise<string> {
    const mimeType = file.mimetype || 'image/jpeg';

    const response = await this.googleFetch(accessToken, `${PHOTOS_API_BASE}/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-Content-Type': mimeType,
      },
      body: new Uint8Array(file.buffer),
    });

    const body = await response.text();

    if (response.status === 401) {
      throw new UnauthorizedException(
        'Token Google không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    if (!response.ok) {
      this.logger.error(`uploadBytes failed (${response.status}): ${body}`);
      throw new Error(`Upload bytes thất bại (${response.status}): ${body}`);
    }

    const uploadToken = body.trim();
    if (!uploadToken) {
      throw new Error('Google không trả upload token');
    }

    return uploadToken;
  }

  /** Bước 2: Dùng uploadToken tạo media item trên Google Photos */
  private async createMediaItem(
    uploadToken: string,
    fileName: string,
    accessToken: string,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.googleFetch(
        accessToken,
        `${PHOTOS_API_BASE}/mediaItems:batchCreate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newMediaItems: [
              {
                simpleMediaItem: {
                  uploadToken,
                  fileName,
                },
              },
            ],
          }),
        },
      );

      const body = await response.text();
      let data: any;

      try {
        data = JSON.parse(body);
      } catch {
        throw new Error(`Phản hồi batchCreate không hợp lệ: ${body}`);
      }

      if (response.status === 429 && attempt < 2) {
        const waitMs = 30000 * (attempt + 1);
        this.logger.warn(`batchCreate bị giới hạn, chờ ${waitMs}ms...`);
        await this.sleep(waitMs);
        continue;
      }

      if (response.status === 401) {
        throw new UnauthorizedException(
          'Token Google không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
        );
      }

      if (!response.ok) {
        this.logger.error(`batchCreate failed (${response.status}): ${body}`);
        throw new Error(`Tạo media item thất bại (${response.status}): ${body}`);
      }

      const result = data?.newMediaItemResults?.[0];
      const statusCode = result?.status?.code;

      if (statusCode !== undefined && statusCode !== 0) {
        throw new Error(result?.status?.message || 'Tạo media item thất bại');
      }

      const mediaItem = result?.mediaItem;
      if (!mediaItem?.id) {
        this.logger.error(`batchCreate không có mediaItem: ${body}`);
        throw new Error('Google không trả media item ID');
      }

      return mediaItem;
    }

    throw new Error('Tạo media item thất bại sau nhiều lần thử');
  }

  /** Lấy chi tiết nhiều media item (tối đa 50/lần) */
  private async fetchMediaItemDetailsBatch(
    mediaItemIds: string[],
    accessToken: string,
  ): Promise<{
    found: Map<string, { baseUrl?: string; productUrl?: string }>;
    missingIds: string[];
    apiOk: boolean;
  }> {
    const found = new Map<string, { baseUrl?: string; productUrl?: string }>();
    const missingIds: string[] = [];
    if (mediaItemIds.length === 0) {
      return { found, missingIds, apiOk: true };
    }

    const params = new URLSearchParams();
    for (const id of mediaItemIds) {
      params.append('mediaItemIds', id);
    }

    const response = await this.googleFetch(
      accessToken,
      `${PHOTOS_API_BASE}/mediaItems:batchGet?${params.toString()}`,
      { method: 'GET' },
    );

    const body = await response.text();
    if (!response.ok) {
      this.logger.warn(`batchGet failed (${response.status}): ${body}`);
      return { found, missingIds, apiOk: false };
    }

    const data = JSON.parse(body);
    const results = data?.mediaItemResults || [];

    for (let i = 0; i < mediaItemIds.length; i += 1) {
      const requestedId = mediaItemIds[i];
      const entry = results[i];
      const mediaItem = entry?.mediaItem;

      if (mediaItem?.id && mediaItem.baseUrl) {
        found.set(requestedId, {
          baseUrl: mediaItem.baseUrl,
          productUrl: mediaItem.productUrl,
        });
      } else {
        missingIds.push(requestedId);
      }
    }

    return { found, missingIds, apiOk: true };
  }

  /** Đồng bộ DB với Google: refresh URL + xóa bản ghi không còn trên Photos */
  private async syncMediaItemsWithGoogle(
    items: MediaItem[],
    accessToken: string,
  ): Promise<{ items: MediaItem[]; removedCount: number }> {
    const ids = [...new Set(items.map((item) => item.mediaItemId))];
    const chunkSize = 50;
    const toRemove: MediaItem[] = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunkIds = ids.slice(i, i + chunkSize);
      const { found, missingIds, apiOk } = await this.fetchMediaItemDetailsBatch(
        chunkIds,
        accessToken,
      );

      if (!apiOk) {
        continue;
      }

      const missingSet = new Set(missingIds);
      const chunkItems = items.filter((item) => chunkIds.includes(item.mediaItemId));

      for (const item of chunkItems) {
        if (missingSet.has(item.mediaItemId)) {
          toRemove.push(item);
          continue;
        }

        const details = found.get(item.mediaItemId);
        if (!details?.baseUrl) continue;

        item.baseUrl = details.baseUrl;
        item.productUrl = details.productUrl || item.productUrl;
        await this.mediaItemRepo.save(item);
      }
    }

    if (toRemove.length > 0) {
      await this.mediaItemRepo.remove(toRemove);
      this.logger.log(
        `Đã dọn ${toRemove.length} bản ghi không còn trên Google Photos`,
      );
    }

    const removedIds = new Set(toRemove.map((item) => item.id));
    const remaining = items.filter((item) => !removedIds.has(item.id));

    return { items: remaining, removedCount: toRemove.length };
  }

  private async performUpload(
    file: Express.Multer.File,
    accessToken: string,
    email: string,
  ) {
    const fileName = this.sanitizeFileName(file.originalname);

    this.logger.log(`Bắt đầu upload: ${fileName} (${file.size} bytes)`);

    const uploadToken = await this.uploadBytes(file, accessToken);
    this.logger.log(`Đã nhận uploadToken cho: ${fileName}`);

    const created = await this.createMediaItem(uploadToken, fileName, accessToken);
    this.logger.log(`Đã tạo mediaItem: ${created.id}`);

    let baseUrl: string | null = created.baseUrl || null;
    let productUrl: string | null = created.productUrl || this.buildProductUrl(created.id);

    if (!baseUrl) {
      const { found } = await this.fetchMediaItemDetailsBatch([created.id], accessToken);
      const details = found.get(created.id);
      baseUrl = details?.baseUrl || null;
      productUrl = productUrl || details?.productUrl || null;
    }

    const item = this.mediaItemRepo.create({
      mediaItemId: created.id,
      baseUrl,
      productUrl,
      email,
      fileName,
    });
    await this.mediaItemRepo.save(item);

    return {
      success: true,
      mediaItemId: created.id,
      thumbnailUrl: baseUrl ? this.buildThumbnailUrl(baseUrl) : null,
      fullUrl: baseUrl ? this.buildThumbnailUrl(baseUrl, 'w1920-h1080') : null,
      productUrl,
      fileName,
      createdAt: item.createdAt,
    };
  }

  async uploadFile(
    file: Express.Multer.File,
    accessToken: string,
    email: string,
  ) {
    const task = uploadQueue.then(() => this.performUpload(file, accessToken, email));

    uploadQueue = task.catch(() => undefined);

    try {
      return await task;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Upload lỗi: ${error.message}`);
      throw new InternalServerErrorException(`Lỗi Upload: ${error.message}`);
    }
  }

  async getMyFiles(email: string, accessToken?: string) {
    let items = await this.mediaItemRepo.find({
      where: { email },
      order: { createdAt: 'DESC' },
    });

    const mapItem = (item: MediaItem) => {
      const googleThumb = item.baseUrl ? this.buildThumbnailUrl(item.baseUrl) : null;
      const googleFull = item.baseUrl ? this.buildThumbnailUrl(item.baseUrl, 'w1920-h1080') : null;

      return {
        id: item.id,
        email: item.email,
        fileName: item.fileName,
        mediaItemId: item.mediaItemId,
        thumbnailUrl: googleThumb,
        fullUrl: googleFull,
        productUrl: item.productUrl || this.buildProductUrl(item.mediaItemId),
        createdAt: item.createdAt,
      };
    };

    if (!accessToken || items.length === 0) {
      return items.map((item) => mapItem(item));
    }

    try {
      const sync = await this.syncMediaItemsWithGoogle(items, accessToken);
      items = sync.items;

      if (sync.removedCount > 0) {
        this.uploadGateway.emitFilesUpdated(email);
      }
    } catch (error: any) {
      this.logger.warn(`Không đồng bộ được với Google Photos: ${error.message}`);
    }

    return items.map((item) => mapItem(item));
  }



  async deleteLocalRecord(id: number, email: string) {
    const item = await this.mediaItemRepo.findOne({ where: { id, email } });
    if (!item) {
      throw new NotFoundException('Ảnh không tồn tại');
    }

    await this.mediaItemRepo.remove(item);
    return { success: true, id };
  }
}
