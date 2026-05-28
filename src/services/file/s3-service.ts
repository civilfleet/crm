// Filename: s3Service.ts

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import logger from "@/lib/logger";
import s3Client, { s3PresignClient } from "@/lib/s3-client";

import { cleanFileName } from "@/lib/utils";

export const createFileUpload = async ({
  fileName,
  fileType,
}: {
  fileName: string;
  fileType: string;
}) => {
  try {
    const key = `${Date.now()}-${cleanFileName(fileName)}`;

    const command = new PutObjectCommand({
      Key: key,
      ContentType: fileType,
      Bucket: process.env.NEXT_AWS_S3_BUCKET_NAME,
    });

    // Generate pre-signed PUT URL
    const putUrl = await getSignedUrl(s3PresignClient, command, {
      expiresIn: 500,
    });

    return { putUrl, key };
  } catch (error) {
    logger.error({ error, fileName, fileType }, "Error uploading file to S3");
    throw error;
  }
};

export const uploadFile = async ({
  fileName,
  fileType,
}: {
  fileName: string;
  fileType: string;
}) => {
  const upload = await createFileUpload({ fileName, fileType });
  return upload.putUrl;
};

// Filename: s3Service.ts

export const deleteFile = async (fileKey: string) => {
  try {
    const command = new DeleteObjectCommand({
      Key: fileKey,
      Bucket: process.env.NEXT_AWS_S3_BUCKET_NAME,
    });

    await s3Client.send(command);
    return { success: true, message: "File deleted successfully" };
  } catch (error) {
    logger.error({ error, fileKey }, "Error deleting file from S3");
    throw new Error("Error deleting file");
  }
};
