const router = require('express').Router();
const multer = require('multer');
const path = require('path');
require('dotenv').config();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB limit for contents
    }
});

module.exports = (pool, bucket) => {
    // Helper to get signed URL
    const getSignedUrl = async (fileName) => {
        try {
            if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') return null;
            if (!bucket) return null;
            const file = bucket.file(fileName.trim());
            const [exists] = await file.exists();
            if (!exists) return null;

            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000
            });
            return url;
        } catch (e) {
            return null;
        }
    };

    // Helper to upload to GCS
    const uploadToGCS = async (buffer, filePath, contentType) => {
        if (!bucket) throw new Error('Storage bucket not configured');
        const file = bucket.file(filePath);
        
        // Delete if already exists to overwrite
        const [exists] = await file.exists();
        if (exists) await file.delete();
        
        return new Promise((resolve, reject) => {
            const stream = file.createWriteStream({
                metadata: { contentType },
                resumable: false
            });
            stream.on('error', reject);
            stream.on('finish', () => resolve(filePath));
            stream.end(buffer);
        });
    };

    // --- DIAGNOSTIC ---
    router.get('/test_db', async (req, res) => {
        try {
            const [tables] = await pool.query('SHOW TABLES');
            res.json({ tables, has_bucket: !!bucket });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- AUDIO ---
    router.get('/all_audio_data', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM audio ORDER BY id DESC');
            const audioDataList = await Promise.all(rows.map(async (audio) => {
                const audioFile = audio.audio_file || audio.audiofile;
                const coverImage = audio.cover_image || audio.coverImage;
                audio.audio_file_url = await getSignedUrl(audioFile);
                audio.cover_image_url = await getSignedUrl(coverImage);
                return audio;
            }));
            res.json(audioDataList);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/audio_categories', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT DISTINCT category FROM audio WHERE category IS NOT NULL AND category != \'\'');
            const categories = rows.map(row => row.category);
            res.json(categories);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/audio_data', upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'audioFile', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { title, subtitle, category } = req.body;
            const coverFile = req.files['coverImage'] ? req.files['coverImage'][0] : null;
            const audioFile = req.files['audioFile'] ? req.files['audioFile'][0] : null;

            if (!title || !subtitle || !category || !coverFile || !audioFile) {
                return res.status(400).json({ message: 'Missing required fields or files' });
            }

            const coverPath = `images/${coverFile.originalname}`;
            const audioPath = `audio_files/${audioFile.originalname}`;

            await Promise.all([
                uploadToGCS(coverFile.buffer, coverPath, coverFile.mimetype),
                uploadToGCS(audioFile.buffer, audioPath, audioFile.mimetype)
            ]);

            const [result] = await pool.query(
                'INSERT INTO audio (title, subtitle, category, coverImage, audiofile) VALUES (?, ?, ?, ?, ?)',
                [title, subtitle, category, coverPath, audioPath]
            );

            res.json({ success: true, id: result.insertId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/audio_data/:id', upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'audioFile', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { id } = req.params;
            const { title, subtitle, category } = req.body;
            
            // Get current data
            const [current] = await pool.query('SELECT * FROM audio WHERE id = ?', [id]);
            if (current.length === 0) return res.status(404).json({ message: 'Audio not found' });

            let coverPath = current[0].coverImage || current[0].cover_image;
            let audioPath = current[0].audiofile || current[0].audio_file;

            if (req.files['coverImage']) {
                const file = req.files['coverImage'][0];
                coverPath = `images/${file.originalname}`;
                await uploadToGCS(file.buffer, coverPath, file.mimetype);
            }
            if (req.files['audioFile']) {
                const file = req.files['audioFile'][0];
                audioPath = `audio_files/${file.originalname}`;
                await uploadToGCS(file.buffer, audioPath, file.mimetype);
            }

            await pool.query(
                'UPDATE audio SET title = ?, subtitle = ?, category = ?, coverImage = ?, audiofile = ? WHERE id = ?',
                [title, subtitle, category, coverPath, audioPath, id]
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/audio_data/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM audio WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- VIDEO ---
    router.get('/all_video_data', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM video ORDER BY id DESC');
            const videoDataList = await Promise.all(rows.map(async (video) => {
                const videoFile = video.video_file || video.videofile;
                const coverImage = video.cover_image || video.coverImage;
                
                const isYouTube = videoFile && (videoFile.includes("youtube.com") || videoFile.includes("youtu.be"));
                video.video_file_url = isYouTube ? videoFile : await getSignedUrl(videoFile);
                video.cover_image_url = await getSignedUrl(coverImage);
                return video;
            }));
            res.json(videoDataList);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/video_data', upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'videoFile', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { title, subtitle, category, uploadType } = req.body;
            const coverFile = req.files['coverImage'] ? req.files['coverImage'][0] : null;
            
            let videoPath = '';
            if (uploadType === 'file') {
                const file = req.files['videoFile'] ? req.files['videoFile'][0] : null;
                if (!file) return res.status(400).json({ message: 'Video file required' });
                videoPath = `video_files/${file.originalname}`;
                await uploadToGCS(file.buffer, videoPath, file.mimetype);
            } else {
                videoPath = req.body.videoFile; // YouTube link
            }

            if (!title || !subtitle || !category || (!coverFile && uploadType === 'file')) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            let coverPath = '';
            if (coverFile) {
                coverPath = `images/${coverFile.originalname}`;
                await uploadToGCS(coverFile.buffer, coverPath, coverFile.mimetype);
            }

            const [result] = await pool.query(
                'INSERT INTO video (title, subtitle, category, coverImage, videofile) VALUES (?, ?, ?, ?, ?)',
                [title, subtitle, category, coverPath, videoPath]
            );

            res.json({ success: true, id: result.insertId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/video_data/:id', upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'videoFile', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { id } = req.params;
            const { title, subtitle, category, uploadType } = req.body;

            const [current] = await pool.query('SELECT * FROM video WHERE id = ?', [id]);
            if (current.length === 0) return res.status(404).json({ message: 'Video not found' });

            let coverPath = current[0].coverImage || current[0].cover_image;
            let videoPath = current[0].videofile || current[0].video_file;

            if (req.files['coverImage']) {
                const file = req.files['coverImage'][0];
                coverPath = `images/${file.originalname}`;
                await uploadToGCS(file.buffer, coverPath, file.mimetype);
            }

            if (uploadType === 'file') {
                if (req.files['videoFile']) {
                    const file = req.files['videoFile'][0];
                    videoPath = `video_files/${file.originalname}`;
                    await uploadToGCS(file.buffer, videoPath, file.mimetype);
                }
            } else {
                videoPath = req.body.videoFile; // YouTube link
            }

            await pool.query(
                'UPDATE video SET title = ?, subtitle = ?, category = ?, coverImage = ?, videofile = ? WHERE id = ?',
                [title, subtitle, category, coverPath, videoPath, id]
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/video_data/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM video WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};

