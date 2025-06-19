require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const AdmZip = require('adm-zip');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS to allow requests from Vercel frontend
app.use(cors({
  origin: 'https://video-one-mocha.vercel.app/',
}));
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads and screenshots directories exist
const setupDirectories = async () => {
  await fs.mkdir('uploads', { recursive: true });
  await fs.mkdir('screenshots', { recursive: true });
};
setupDirectories();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sadikot5580@gmail.com',
    pass: process.env.GMAIL_PASS,
  },
});

app.post('/api/process-video', upload.single('video'), async (req, res) => {
  try {
    const videoPath = req.file.path;
    const outputDir = path.join(__dirname, 'screenshots', req.file.filename);
    await fs.mkdir(outputDir, { recursive: true });

    // Extract screenshots every 3 seconds
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 0,
          timemarks: [],
          folder: outputDir,
          filename: 'screenshot-%03d.png',
        })
        .on('start', () => {
          ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) return reject(err);
            const duration = metadata.format.duration;
            const timemarks = [];
            for (let i = 0; i < duration; i += 3) {
              timemarks.push(i);
            }
            ffmpeg(videoPath).screenshots({
              timemarks,
              folder: outputDir,
              filename: 'screenshot-%03d.png',
            }).on('end', resolve).on('error', reject);
          });
        })
        .on('error', reject);
    });

    // Create ZIP file
    const zip = new AdmZip();
    const screenshotFiles = await fs.readdir(outputDir);
    for (const file of screenshotFiles) {
      const filePath = path.join(outputDir, file);
      zip.addLocalFile(filePath);
    }
    const zipPath = path.join(__dirname, 'screenshots', `${req.file.filename}.zip`);
    zip.writeZip(zipPath);

    // Send email with ZIP attachment
    const mailOptions = {
      from: 'sadikot5580@gmail.com',
      to: 'sadikot5580@gmail.com',
      subject: 'Your Video Screenshots ZIP',
      text: 'Attached is the ZIP file containing screenshots from your video.',
      attachments: [{ path: zipPath }],
    };

    await transporter.sendMail(mailOptions);

    // Generate public download URL
    const downloadUrl = `https://your-render-backend.onrender.com/downloads/${req.file.filename}.zip`;

    // Clean up video file
    await fs.unlink(videoPath);

    res.json({ downloadUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process video.' });
  }
});

// Serve ZIP files for download
app.get('/downloads/:filename', async (req, res) => {
  const filePath = path.join(__dirname, 'screenshots', req.params.filename);
  try {
    await fs.access(filePath);
    res.download(filePath, (err) => {
      if (!err) {
        fs.unlink(filePath).catch(console.error);
        fs.rm(path.join(__dirname, 'screenshots', req.params.filename.replace('.zip', '')), { recursive: true }).catch(console.error);
      }
    });
  } catch {
    res.status(404).json({ error: 'File not found.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
