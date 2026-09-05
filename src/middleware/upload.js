'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../../config');

/**
 * Uploads are held in memory, validated, then written out by the route.
 * Nothing reaches disk until we have confirmed it really is an image, which
 * keeps a renamed executable from ever landing in the uploads tree.
 */
const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxFileBytes, files: 6 },
  fileFilter(req, file, cb) {
    if (config.uploads.allowedImage.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Only JPG, PNG, WebP and HEIC images are accepted.');
    err.status = 400;
    err.code = 'BAD_FILE_TYPE';
    return cb(err);
  },
});

const kycUpload = memory.fields([
  { name: 'id_front', maxCount: 1 },
  { name: 'id_back', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'proof_of_address', maxCount: 1 },
]);

const listingUpload = memory.array('images', 24);

/**
 * Re-encode an uploaded image and write it to `dir`.
 *
 * Passing the bytes through sharp strips EXIF (which on a phone selfie carries
 * GPS coordinates), normalises orientation, caps the dimensions and guarantees
 * the output really is the format we claim it is.
 */
async function processImage(buffer, { dir, prefix, maxWidth = 2000, quality = 82 }) {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    const err = new Error('That file is not a readable image.');
    err.status = 400;
    throw err;
  }

  const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  const outputPath = path.join(dir, fileName);
  fs.mkdirSync(dir, { recursive: true });

  await sharp(buffer)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toFile(outputPath);

  const { size } = fs.statSync(outputPath);
  return { fileName, path: outputPath, sizeBytes: size, width: meta.width, height: meta.height };
}

module.exports = { memory, kycUpload, listingUpload, processImage };
