const { gcpInit } = require("./gcpInit");

async function gcsdelete(cat_name, isAudio, sound_name) {
  try {
    const bucket = gcpInit();
    let prefix;
    if (isAudio) {
      prefix = `${cat_name}/${sound_name}/`;
    } else {
      prefix = `${cat_name}/`;
    }

    await bucket.deleteFiles({ prefix, force: true });
    return { ok: true, prefix };
  } catch (err) {
    console.log(err);
    throw err;
  }
}

module.exports = { gcsdelete };