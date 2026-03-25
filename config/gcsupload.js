const { gcpInit } = require("./gcpInit");

async function gcsupload(cat_name, filename, isAudio, sound_name) {
  try {
    const bucket = gcpInit();
    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing GCP_BUCKET_NAME in environment");

    let directory;
    if (isAudio) {
      directory = `${cat_name}/${sound_name}/${filename.originalname}`;
    } else {
      directory = `${cat_name}/${filename.originalname}`;
    }

    const file = bucket.file(directory);

    await new Promise((resolve, reject) => {
      const writeStream = file.createWriteStream({
        metadata: {
          contentType: filename.mimetype,
        },
      });
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);
      writeStream.end(filename.buffer);
    });

    return `https://storage.googleapis.com/${bucketName}/${directory}`;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

module.exports = { gcsupload };