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
    
            // Get the current maximum ID from the table
            const [maxIdResult] = await pool.query(
                'SELECT MAX(id) as maxId FROM todaysThoughts'
            );
            const nextId = (maxIdResult[0].maxId || 0) + 1;
    
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
                        (id, content, author, date, audiofile) 
                        VALUES (?, ?, ?, STR_TO_DATE(?, '%d-%m-%Y'), ?)`,
                        [
                            nextId + insertedIds.length,
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
                nextExpectedId: nextId + insertedIds.length,
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

    // Endpoint to upload audio files (unchanged)
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
                    const filePath = `audio_files/Today_thoughts/${file.originalname}`;
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

    // Helper function to upload to GCS (unchanged)
    async function uploadFileToGCS(buffer, filePath, contentType) {
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