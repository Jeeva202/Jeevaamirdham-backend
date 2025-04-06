const router = require('express').Router()
const AWS = require('aws-sdk')
require('dotenv').config()


module.exports = (pool, bucket) => {
    // API to get audio data
    router.get('/audio_data', async (req, res) => {
        try {
            const audioId = req.query.id;
            const query = 'SELECT * FROM audio WHERE id = $1';
            const result = await pool.query(query, [audioId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Audio not found' });
            }

            const audioData = result.rows[0];
            const signedUrl = await bucket.file(audioData.audio_file).getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
            });
            audioData.audio_file_url = signedUrl[0];

            res.json(audioData);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // API to get all audio data
    router.get('/all_audio_data', async (req, res) => {
        try {
            const query = 'SELECT * FROM audio';
            const [result] = await pool.query(query);

            const audioDataList = await Promise.all(result.map(async (audioData) => {
                const signedUrl_audiofile = await bucket.file(audioData.audiofile).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
                const signedUrl_coverImage = await bucket.file(audioData.coverImage).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
                audioData.audiofile_url = signedUrl_audiofile[0];
                audioData.coverImage_url = signedUrl_coverImage[0];
                return audioData;
            }));
            res.json(audioDataList);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // API to post audio data
    router.post('/audio_data', async (req, res) => {
        try {
            const { title, subtitle, category, coverImage, audioFile } = req.body;
            const query = 'INSERT INTO audio (title, subtitle, category, cover_image, audio_file) VALUES ($1, $2, $3, $4) RETURNING *';
            const result = await pool.query(query, [title, subtitle, category, coverImage, audioFile]);

            const newAudioData = result.rows[0];
            res.status(201).json(newAudioData);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

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

    // API to get all video data
    router.get('/all_video_data', async (req, res) => {
        try {
            const query = 'SELECT * FROM video';
            const [result] = await pool.query(query);
            const videoDataList = await Promise.all(result.map(async (videoData) => {
                const signedUrl_videofile = await bucket.file(videoData.videofile).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
                const signedUrl_coverImage = await bucket.file(videoData.coverImage).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
                videoData.videofile_url = signedUrl_videofile[0];
                videoData.coverImage_url = signedUrl_coverImage[0];
                return videoData;
            }));

            res.json(videoDataList);
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

    return router
}