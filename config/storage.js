const { gcsupload: gcsUploadOrig } = require("./google/gcsupload.js");
const { gcsdelete: gcsDeleteOrig } = require("./google/gcsdelete.js");
const { r2upload } = require("./cloudflare/r2upload.js");
const { r2delete } = require("./cloudflare/r2delete.js");

async function gcsupload(cat_name, filename, isAudio, sound_name, destination) {
  if (process.env.BUCKET_TYPE === "cloudflare_R2") {
    return r2upload(cat_name, filename, isAudio, sound_name, destination);
  }
  return gcsUploadOrig(cat_name, filename, isAudio, sound_name);
}

async function gcsdelete(cat_name, isAudio, sound_name) {
  if (process.env.BUCKET_TYPE === "cloudflare_R2") {
    return r2delete(cat_name, isAudio, sound_name);
  }
  return gcsDeleteOrig(cat_name, isAudio, sound_name);
}

function getAssetBaseUrl() {
  if (process.env.ASSET_BASE_URL) {
    return process.env.ASSET_BASE_URL.replace(/\/+$/, "");
  }
  if (process.env.BUCKET_TYPE === "cloudflare_R2") {
    return (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/+$/, "");
  }
  const bucketName = process.env.GCP_BUCKET_NAME || "";
  return bucketName ? `https://storage.googleapis.com/${bucketName}` : "";
}

function toRelativePath(urlOrPath) {
  if (urlOrPath == null) return "";
  let str = String(urlOrPath).trim();
  if (!str) return "";

  if (str.startsWith("http://") || str.startsWith("https://")) {
    try {
      const parsed = new URL(str);
      let pathname = parsed.pathname.replace(/^\/+/, "");

      const gcpBucket = process.env.GCP_BUCKET_NAME;
      if (parsed.hostname === "storage.googleapis.com" && gcpBucket) {
        if (pathname.startsWith(`${gcpBucket}/`)) {
          pathname = pathname.slice(gcpBucket.length + 1);
        }
      }
      return pathname;
    } catch {
      return str;
    }
  }

  return str.replace(/^\/+/, "");
}

function getAssetUrl(path) {
  const relative = toRelativePath(path);
  if (!relative) return "";
  const baseUrl = getAssetBaseUrl();
  return baseUrl ? `${baseUrl}/${relative}` : relative;
}

module.exports = { gcsupload, gcsdelete, toRelativePath, getAssetBaseUrl, getAssetUrl };
