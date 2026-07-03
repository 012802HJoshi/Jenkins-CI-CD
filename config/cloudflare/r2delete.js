const { ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { r2Init } = require("./r2Init.js");

async function r2delete(cat_name, isAudio, sound_name) {
  try {
    const bucketName = process.env.CLOUDFLARE_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing CLOUDFLARE_BUCKET_NAME in environment");

    let prefix;
    if (isAudio) {
      prefix = `${cat_name}/${sound_name}/`;
    } else {
      prefix = `${cat_name}/`;
    }

    let isTruncated = true;
    let continuationToken;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listedObjects = await r2Init.send(listCommand);

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        const deleteParams = {
          Bucket: bucketName,
          Delete: {
            Objects: listedObjects.Contents.map(({ Key }) => ({ Key })),
          },
        };
        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await r2Init.send(deleteCommand);
      }

      isTruncated = listedObjects.IsTruncated;
      continuationToken = listedObjects.NextContinuationToken;
    }

    return { ok: true, prefix };
  } catch (err) {
    console.error("Error deleting from R2:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
      metadata: err.$metadata,
    });
    throw err;
  }
}

module.exports = { r2delete };
