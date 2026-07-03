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

module.exports = { gcsupload, gcsdelete };
