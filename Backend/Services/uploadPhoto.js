// === BACKEND SERVICE: uploadPhoto.js ===
const multer = require('multer');
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const useS3     = process.env.USE_S3 === '1';
const bucketName= process.env.AWS_S3_BUCKET_NAME;
const region    = process.env.AWS_S3_REGION;
let s3Client    = null;
if (useS3) {
  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

// multer memory storage
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG/PNG images allowed'));
  },
  limits: {
    fileSize: 2 * 1024 * 1024  // 2 MB max
  }
});

async function processAndUpload(buffer, filename, mimetype) {
  // resize image to max width 500x500, cover
  const resizedBuffer = await sharp(buffer)
    .resize({ width: 500, height: 500, fit: 'cover' })
    .toFormat('jpeg')
    .jpeg({ quality: 80 })
    .toBuffer();

  if (useS3 && s3Client) {
    const key = `profiles/${Date.now()}_${filename}.jpeg`;
    const cmd = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: resizedBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read'
    });
    await s3Client.send(cmd);
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
    return url;
  } else {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const outFilename = `${Date.now()}_${filename}.jpeg`;
    const outPath     = path.join(uploadDir, outFilename);
    fs.writeFileSync(outPath, resizedBuffer);
    return `/uploads/profiles/${outFilename}`;
  }
}

module.exports = {
  uploadSingle: upload.single('profilePhoto'),
  processAndUpload
};
