const router = require('express').Router()
const AWS = require('aws-sdk')
require('dotenv').config()
const { Storage } = require('@google-cloud/storage');

const projectId = process.env.PROJECT_ID; 
const storage = new Storage({
    keyFilename:"./key.json"
});  // Create a new Google Cloud Storage instance
const bucketName = process.env.BUCKET;
const bucket = storage.bucket(bucketName)

module.exports = (pool) => {
    // API to get video data
    router.get('/video_data', async (req, res) => {
        try {
            const videoId = req.query.id;
            const query = 'SELECT * FROM video WHERE id = $1';
            const result = await pool.query(query, [videoId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Video not found' });
            }

            const videoData = result.rows[0];
            const signedUrl = await bucket.file(videoData.video_file).getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
            });
            videoData.video_file_url = signedUrl[0];

            res.json(videoData);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // API to post video data
    router.post('/video_data', async (req, res) => {
        try {
            const { title, subtitle, coverImage, videoFile } = req.body;
            const query = 'INSERT INTO video (title, subtitle, cover_image, video_file) VALUES ($1, $2, $3, $4) RETURNING *';
            const result = await pool.query(query, [title, subtitle, coverImage, videoFile]);

            const newVideoData = result.rows[0];
            res.status(201).json(newVideoData);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // API to get all video data
    router.get('/all_video_data', async (req, res) => {
        try {
            const query = 'SELECT * FROM video';
            const result = await pool.query(query);

            const videoDataList = await Promise.all(result.rows.map(async (videoData) => {
                const signedUrl = await bucket.file(videoData.video_file).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
                videoData.video_file_url = signedUrl[0];
                return videoData;
            }));

            res.json(videoDataList);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router
}
