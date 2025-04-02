import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

const datasetBucket = "liquipeg-server-data";
const s3Client = new S3Client({});

function next21Minutedate() {
  const dt = new Date();
  dt.setHours(dt.getHours() + 1);
  dt.setMinutes(21);
  return dt;
}

export async function store(
  filename: string,
  body: string | Readable | Buffer,
  hourlyCache = false,
  compressed = true
) {
  const command = new PutObjectCommand({
    Bucket: datasetBucket,
    Key: filename,
    Body: body,
    ACL: "public-read",
    ...(hourlyCache && {
      Expires: next21Minutedate(),
      ...(compressed && {
        ContentEncoding: "br",
      }),
      ContentType: "application/json",
    }),
  });

  await s3Client.send(command);
}

export async function storeDataset(filename: string, body: string) {
  const command = new PutObjectCommand({
    Bucket: datasetBucket,
    Key: `temp/${filename}`,
    Body: body,
    ACL: "public-read",
    ContentType: "text/csv",
  });

  await s3Client.send(command);
}
