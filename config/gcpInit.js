const { Storage } = require("@google-cloud/storage");

function gcpInit() {
  const privateKey = process.env.GCP_PRIVATE_KEY
    ? process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  const storage = new Storage({
    credentials: {
      type: "service_account",
      project_id: process.env.GCP_PROJECT_ID,
      private_key_id: process.env.GCP_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.GCP_CLIENT_EMAIL,
      client_id: process.env.GCP_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.GCP_CLIENT_X509_CERT_URL,
      universe_domain: "googleapis.com",
    },
  });

  const bucketName = process.env.GCP_BUCKET_NAME;
  if (!bucketName) throw new Error("Missing GCP_BUCKET_NAME in environment");

  return storage.bucket(bucketName);
}

module.exports = { gcpInit };
