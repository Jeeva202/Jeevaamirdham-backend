const router = require('express').Router();
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 30 * 1024 * 1024, // 30MB limit per file
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
            console.error(`Error getting signed URL for ${fileName}:`, e);
            return null;
        }
    };

    // GET all thoughts
    router.get('/all', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT *, DATE_FORMAT(date, "%d-%m-%Y") as formatted_date FROM todaysThoughts ORDER BY date DESC, id DESC');
            
            // Generate signed URLs for audio files if they exist
            const processedRows = await Promise.all(rows.map(async (thought) => {
                if (thought.audiofile) {
                    thought.audio_url = await getSignedUrl(thought.audiofile);
                }
                return thought;
            }));

            res.json(processedRows);
        } catch (err) {
            console.error('Error fetching all thoughts:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST manual entry
    router.post('/add', upload.single('audioFile'), async (req, res) => {
        try {
            const { content, author, date } = req.body;
            let audiofilePath = null;

            if (req.file) {
                audiofilePath = `audio_files/Today_Thoughts/${req.file.originalname}`;
                await uploadFileToGCS(req.file.buffer, audiofilePath, req.file.mimetype);
            }

            const query = `
                INSERT INTO todaysThoughts (content, author, date, audiofile)
                VALUES (?, ?, STR_TO_DATE(?, '%d-%m-%Y'), ?)
            `;
            const [result] = await pool.query(query, [content, author, date, audiofilePath]);

            res.json({ 
                success: true, 
                message: 'Thought added successfully', 
                id: result.insertId,
                audiofile: audiofilePath
            });
        } catch (err) {
            console.error('Error adding thought:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT update entry
    router.put('/update/:id', upload.single('audioFile'), async (req, res) => {
        try {
            const { id } = req.params;
            const { content, author, date } = req.body;
            let audiofilePath = req.body.audiofile; // Keep existing path if no new file

            if (req.file) {
                audiofilePath = `audio_files/Today_Thoughts/${req.file.originalname}`;
                await uploadFileToGCS(req.file.buffer, audiofilePath, req.file.mimetype);
            }

            const query = `
                UPDATE todaysThoughts 
                SET content = ?, author = ?, date = STR_TO_DATE(?, '%d-%m-%Y'), audiofile = ?
                WHERE id = ?
            `;
            await pool.query(query, [content, author, date, audiofilePath, id]);

            res.json({ success: true, message: 'Thought updated successfully' });
        } catch (err) {
            console.error('Error updating thought:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE entry
    router.delete('/delete/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM todaysThoughts WHERE id = ?', [id]);
            res.json({ success: true, message: 'Thought deleted successfully' });
        } catch (err) {
            console.error('Error deleting thought:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Endpoint to update thoughts table with Excel data
    router.post('/update_table', async (req, res) => {
        try {
            const { thoughts } = req.body;
            
            if (!thoughts || !Array.isArray(thoughts)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid thoughts data format'
                });
            }
    
            // No need to manually calculate IDs if the table is set to AUTO_INCREMENT
            // But if it's not, we'll keep the logic or let it fail if required
            
            const results = [];
            const insertedIds = [];
            
            // Process each thought
            for (const [index, thought] of thoughts.entries()) {
                // Validate required fields
                if (!thought.content || !thought.author || !thought.date || !thought.audiofile) {
                    results.push({
                        success: false,
                        message: `Missing required fields for entry at position ${index + 1}`,
                        data: thought
                    });
                    continue;
                }
                
                try {
                    // Use STR_TO_DATE to convert DD-MM-YYYY to MySQL DATE format
                    const [result] = await pool.query(
                        `INSERT INTO todaysThoughts 
                        (content, author, date, audiofile) 
                        VALUES (?, ?, STR_TO_DATE(?, '%d-%m-%Y'), ?)`,
                        [
                            thought.content,
                            thought.author,
                            thought.date, // This should be in DD-MM-YYYY format
                            `audio_files/Today_Thoughts/${thought.audiofile}`
                        ]
                    );
    
                    insertedIds.push(result.insertId);
                    results.push({
                        success: true,
                        message: `Successfully added thought by ${thought.author}`,
                        insertId: result.insertId
                    });
                } catch (dbError) {
                    results.push({
                        success: false,
                        message: `Database error for entry at position ${index + 1}: ${dbError.message}`,
                        data: thought
                    });
                }
            }
    
            // Check if any operations failed
            const hasErrors = results.some(r => !r.success);
            
            res.status(hasErrors ? 207 : 200).json({
                success: !hasErrors,
                message: hasErrors ? 
                    'Some operations completed with errors' : 
                    'All thoughts processed successfully',
                results
            });
    
        } catch (err) {
            console.error("Error updating thoughts:", err);
            res.status(500).json({ 
                success: false,
                message: err.message || 'Internal server error' 
            });
        }
    });

    // Endpoint to upload audio files (bulk)
    router.post('/upload_audio', upload.array('audioFiles'), async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No audio files uploaded'
                });
            }

            const uploadedFiles = [];
            
            for (const file of req.files) {
                try {
                    const filePath = `audio_files/Today_Thoughts/${file.originalname}`;
                    await uploadFileToGCS(
                        file.buffer,
                        filePath,
                        file.mimetype
                    );

                    uploadedFiles.push({
                        originalName: file.originalname,
                        filePath: filePath,
                        size: file.size,
                        mimetype: file.mimetype
                    });
                } catch (uploadError) {
                    uploadedFiles.push({
                        originalName: file.originalname,
                        success: false,
                        error: uploadError.message
                    });
                }
            }

            const hasErrors = uploadedFiles.some(f => f.error);
            
            res.status(hasErrors ? 207 : 200).json({
                success: !hasErrors,
                message: hasErrors ? 
                    'Some files uploaded with errors' : 
                    'All files uploaded successfully',
                files: uploadedFiles
            });

        } catch (err) {
            console.error("Error uploading audio files:", err);
            res.status(500).json({ 
                success: false,
                message: err.message || 'Internal server error' 
            });
        }
    });

    // Helper function to upload to GCS
    async function uploadFileToGCS(buffer, filePath, contentType) {
        if (!bucket) throw new Error('Storage bucket not configured');
        const file = bucket.file(filePath);
        
        return new Promise((resolve, reject) => {
            const stream = file.createWriteStream({
                metadata: { 
                    contentType: contentType 
                },
                resumable: false
            });
            
            stream.on('error', reject);
            stream.on('finish', () => resolve(filePath));
            stream.end(buffer);
        });
    }

    return router;
};