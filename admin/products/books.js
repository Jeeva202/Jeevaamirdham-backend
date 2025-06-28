const router = require('express').Router();
const { rmSync } = require('fs');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit for image
    }
});rmSync

module.exports = (pool, bucket) => {

    router.post('/add', upload.single('image'), async (req, res)=>{
        try {
            let { title, subtitle, author, availability, shortDesc, description, orgPrice, offPrice, category  } = req.body;
            if (!shortDesc){
                shortDesc = " "
            }
            // Validate required fields
            if (!title || !subtitle || !author || !availability || !shortDesc || !description || !offPrice || !category  || !req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields including image are required'
                });
            }

            // Generate unique filename with timestamp
            // const timestamp = Date.now();
            // const fileExtension = path.extname(req.file.originalname);
            const imagePath = `images/${req.file.originalname}`;

            // Upload image to cloud storage
            await uploadFileToGCS(
                req.file.buffer,
                imagePath,
                req.file.mimetype
            );

            // Get next ID (max id + 1)
            const [maxIdResult] = await pool.query(
                'SELECT MAX(id) as maxId FROM book'
            );
            const nextId = (maxIdResult[0].maxId || 0) + 1;

            // Insert blog data into database
            const [result] = await pool.query(
                `INSERT INTO book 
                (id, title, subtitle, author, availability, shortDesc, description, offPrice, img, category) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    nextId, 
                    title, 
                    subtitle, 
                    author, 
                    availability, 
                    shortDesc, 
                    description,  
                    offPrice, 
                    imagePath,
                    category
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Book added successfully',
                blogId: nextId
            });

        } catch (err) {
            console.error("Error adding blog:", err);
            res.status(500).json({ 
                success: false,
                message: err.message || 'Internal server error' 
            });
        }
    })
    // Helper function to upload to GCS
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