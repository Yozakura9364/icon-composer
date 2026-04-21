const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const ACCOUNT_ID = '53150477202087f67a975064c614c65b';
const ACCESS_KEY_ID = 'f04c9bce2f1a025e32fe56c238c3c635';
const SECRET_ACCESS_KEY = 'f2446ef4b95dc5e035f50ba79648e2cb1544925345f35493048225c62eed452a';
const BUCKET = 'portable-icon';
const LOCAL_DIR = path.join(__dirname, 'ui', 'sprites');
const R2_PREFIX = 'sprites';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

function getMimeType(ext) {
  const map = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp' };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function uploadDir(localDir, r2Prefix) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const r2Key = r2Prefix + '/' + entry.name;
    if (entry.isDirectory()) {
      await uploadDir(localPath, r2Key);
    } else {
      const body = fs.readFileSync(localPath);
      const ext = path.extname(entry.name);
      try {
        await client.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: r2Key,
          Body: body,
          ContentType: getMimeType(ext),
        }));
        console.log('OK', r2Key);
      } catch (e) {
        console.error('FAIL', r2Key, e.message);
      }
    }
  }
}

uploadDir(LOCAL_DIR, R2_PREFIX).then(() => console.log('Done!')).catch(console.error);
