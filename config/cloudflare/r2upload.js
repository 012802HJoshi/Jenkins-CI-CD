const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { r2Init } = require("./r2Init.js");

async function r2upload(cat_name, filename, isAudio, sound_name, destination) {
  try {
    const bucketName = process.env.CLOUDFLARE_BUCKET_NAME;
    console.log(bucketName);
    if (!bucketName) throw new Error("Missing CLOUDFLARE_BUCKET_NAME in environment");

    let directory = destination;
    if (!directory) {
      if (isAudio) {
        directory = `${cat_name}/${sound_name}/${filename.originalname}`;
      } else {
        directory = `${cat_name}/${filename.originalname}`;
      }
    }

    const uploadParams = {
      Bucket: bucketName,
      Key: directory,
      Body: filename.buffer,
      ContentType: filename.mimetype,
    };

    const command = new PutObjectCommand(uploadParams);
    await r2Init.send(command);

    // Extract Account ID from endpoint
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    let accountId = "";
    if (endpoint) {
      const match = endpoint.match(/https?:\/\/([^.]+)\.r2\.cloudflarestorage\.com/);
      if (match) {
        accountId = match[1];
      }
    }

    // Construct the public URL for R2 objects
    const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL || "";

    if (!publicUrlBase) {
      throw new Error("Unable to determine Cloudflare R2 Public URL. Please specify CLOUDFLARE_R2_PUBLIC_URL in your environment.");
    }

    return `${publicUrlBase}/${directory}`;
  } catch (err) {
    console.error("Error uploading to R2:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
      metadata: err.$metadata,
    });
    throw err;
  }
}

module.exports = { r2upload };

