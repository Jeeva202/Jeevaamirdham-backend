const router = require('express').Router();
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB limit for video
        files: 2 // Maximum 2 files (cover image and video)
    }
});

module.exports = (pool, bucket) => {
    // Add new video content
    router.post('/add-video', upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'videoFile', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { title, subtitle, category } = req.body;
            const coverImage = req.files['coverImage'] ? req.files['coverImage'][0] : null;
            const videoFile = req.files['videoFile'] ? req.files['videoFile'][0] : null;
            
            // Validate required fields
            if (!title || !subtitle || !category || !coverImage || !videoFile) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields including files are required'
                });
            }

            // Generate file paths with timestamp to avoid collisions
            const timestamp = Date.now();
            const imageExtension = path.extname(coverImage.originalname);
            const videoExtension = path.extname(videoFile.originalname);
            
            const imagePath = `images/${coverImage.originalname}`;
            const videoPath = `video_files/${videoFile.originalname}`;

            // Upload files to GCS
            await Promise.all([
                uploadFileToGCS(coverImage.buffer, imagePath, coverImage.mimetype),
                uploadFileToGCS(videoFile.buffer, videoPath, videoFile.mimetype)
            ]);

            // Insert video data into database
            const [result] = await pool.query(
                `INSERT INTO video 
                (title, subtitle, category, coverImage, videofile) 
                VALUES (?, ?, ?, ?, ?)`,
                [title, subtitle, category, imagePath, videoPath]
            );

            res.status(200).json({
                success: true,
                message: 'Video content added successfully',
                data: {
                    id: result.insertId,
                    title,
                    subtitle,
                    category
                }
            });

        } catch (err) {
            console.error("Error adding video content:", err);
            res.status(500).json({ 
                success: false,
                message: err.message || 'Internal server error' 
            });
        }
    });

    // Helper function to upload to GCS
    async function uploadFileToGCS(buffer, filePath, contentType) {
        const file = bucket.file(filePath);
        
        // Check if file exists and delete if it does
        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
        }
        
        return new Promise((resolve, reject) => {
            const stream = file.createWriteStream({
                metadata: { contentType },
                resumable: false
            });
            
            stream.on('error', reject);
            stream.on('finish', () => resolve(filePath));
            stream.end(buffer);
        });
    }


    return router;
};