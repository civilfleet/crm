import { S3, type S3ClientConfig } from "@aws-sdk/client-s3";

interface S3ClientCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

const createS3Client = (endpoint?: string) => {
  const s3ClientConfig: S3ClientConfig = {
    forcePathStyle: true,
    endpoint,
    region: process.env.NEXT_AWS_S3_BUCKET_REGION,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.NEXT_AWS_S3_ACCESS_KEY as string,
      secretAccessKey: process.env.NEXT_AWS_S3_ACCESS_SECRET as string,
    } as S3ClientCredentials,
  };

  return new S3(s3ClientConfig);
};

const s3Client = createS3Client(process.env.NEXT_AWS_S3_ENDPOINT);

export const s3PresignClient = createS3Client(
  process.env.NEXT_AWS_S3_PUBLIC_ENDPOINT || process.env.NEXT_AWS_S3_ENDPOINT,
);

export default s3Client;
