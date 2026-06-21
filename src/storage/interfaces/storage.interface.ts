export interface IStorageService {
  uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
    bucketName?: string,
  ): Promise<string>;

  uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string,
    bucketName?: string,
  ): Promise<string>;

  downloadFile(objectKey: string, bucketName?: string): Promise<Buffer>;

  deleteFile(objectKey: string, bucketName?: string): Promise<void>;

  getPresignedUrl(
    objectKey: string,
    expirySeconds?: number,
    bucketName?: string,
  ): Promise<string>;

  getPublicUrl(objectKey: string, bucketName?: string): Promise<string>;

  checkHealth(): Promise<boolean>;
}
