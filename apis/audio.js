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
            const result = await pool.query(query);

            const audioDataList = await Promise.all(result.rows.map(async (audioData) => {
                const signedUrl = await bucket.file(audioData.audio_file).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
                audioData.audio_file_url = signedUrl[0];
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

    return router
}