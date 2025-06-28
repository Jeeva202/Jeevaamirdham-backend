const router = require('express').Router();
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 30 * 1024 * 1024, // 30MB limit for each file
    }
});
const monthToTamil = {
    "01": "ஜனவரி",
    "02": "பிப்ரவரி",
    "03": "மார்ச்",
    "04": "ஏப்ரல்",
    "05": "மே",
    "06": "ஜூன்",
    "07": "ஜூலை",
    "08": "ஆகஸ்ட்",
    "09": "செப்டம்பர்",
    "10": "அக்டோபர்",
    "11": "நவம்பர்",
    "12": "டிசம்பர்"
};
module.exports = (pool, bucket) => {
    router.post("/add-magazine", upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'audioFiles', maxCount: 50 },
        { name: 'chapterImages', maxCount: 50 }
    ]), async (req, res) => {
        try {
            // Validate all required files are present
            if (!req.files.coverImage || !req.files.audioFiles || !req.files.chapterImages) {
                return res.status(400).json({ message: 'All files are required (cover, audios, images)' });
            }

            const { year, month, excelData } = req.body;
            if (!year || !month || !excelData) {
                return res.status(400).json({ message: 'Year, month and Excel data are required' });
            }

            // Parse the excelData JSON
            const chapters = JSON.parse(excelData);
            const chapterCount = chapters.length;

            // Validate file counts match chapter count
            if (req.files.audioFiles.length !== chapterCount || 
                req.files.chapterImages.length !== chapterCount) {
                return res.status(400).json({ 
                    message: `Number of files doesn't match number of chapters (${chapterCount})`
                });
            }

            // Upload cover image (keeping original filename)
            const coverImagePath = `images/${year}_${month}_cover.jpg`;
            await uploadFileToGCS(
                req.files.coverImage[0].buffer,
                coverImagePath,
                req.files.coverImage[0].mimetype
            );

            // Upload chapter files (keeping original filenames)
            const chapterFiles = [];
            for (let i = 0; i < chapterCount; i++) {
                const chapterNum = i + 1;
                const chapter = chapters[i];
                
                // Upload audio file (original filename)
                const audioPath = `audio_files/${req.files.audioFiles[i].originalname}`;
                await uploadFileToGCS(
                    req.files.audioFiles[i].buffer,
                    audioPath,
                    req.files.audioFiles[i].mimetype
                );
                
                // Upload chapter image (original filename)
                const imagePath = `images/${req.files.chapterImages[i].originalname}`;
                await uploadFileToGCS(
                    req.files.chapterImages[i].buffer,
                    imagePath,
                    req.files.chapterImages[i].mimetype
                );
                
                chapterFiles.push({
                    pageTitle: chapters[i].Title,
                    pageContent: chapters[i].Content,
                    pageImg: `images/${year}_${month}_${chapterNum}.jpg`,
                    audioFile: `audio_files/${year}_${month}_${chapterNum}.mp3`
                });
            }

             // Prepare magazine data similar to Python code
             const magazineData = {
                year: parseInt(year),
                month: parseInt(month),
                title: `${monthToTamil[month]} மாத இதழ்`,
                shortDesc: "சித்தர்கள் அருளிய வாழ்வியல் வழிகாட்டி",
                description: `The knowledge and worship practices of saints, siddhas, and great beings related to God can be understood!

By consuming the nectar of love and transforming family life into virtuous living, one can lead a joyous life!

By removing the illusion of small pleasures and embracing the bliss that brings true happiness, the eight siddhis can be known!

By dispelling ignorance and obtaining divine knowledge, we can experience spiritual wisdom within ourselves!

By elevating our state of being, we can attain the supreme state of God!

The locations and glories of the 875 great saints' samadhis (final resting places) can be known!

This is a practical guide to life that should be present in every household!

Drink the nectar of life and share it with everyone!`,
                author: "ஜீவஅமிர்தம் கோ.திருமுகன், BE",
                category: "GNANAM",
                details: `ஆசிரியர் ஜீவஅமிர்தம் கோ.திருமுகன், BE .,\n அலைபேசி : 9176564723\n சிறப்பாசிரியர் : வைதேகி திருமுகன், M.SC, M.Phil., B.Ed.,\n சட்ட ஆலோசகர் : இராம.சுப்பையா B.A ., B.I.,\n செயலி வடிவமைப்பு : ஜாக்.ப .ஆனந்த்.,\n கௌரவ ஆலோசகர்கள்:\n P.கார்த்திகேயன் (Auditor),\n நா.நாராயணன், A.N பில்டர்ஸ்,\n Dr.முத்துக்குமார் சக்திவேல் (USA),\n தினகரன் B.E.,\n வசந்தகுமார்`,
                img: coverImagePath,
                created_at: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
                audio: JSON.stringify(chapterFiles)
            };


            
            /* Database storage commented out as requested
            const query = `
                INSERT INTO magazines (year, month, cover_image_path, chapters_data)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (year, month) 
                DO UPDATE SET 
                    cover_image_path = EXCLUDED.cover_image_path,
                    chapters_data = EXCLUDED.chapters_data,
                    updated_at = NOW()
                RETURNING *;
            `;
            const values = [
                year, 
                month, 
                coverImagePath, 
                JSON.stringify(chapterFiles)
            ];
            
            const result = await pool.query(query, values);
            */
            
            // Check if record exists
            const [existing] = await pool.query(
                'SELECT * FROM emagazine WHERE year = ? AND month = ?',
                [year, month]
            );
            // console.log("magazine data", magazineData.audio)
            if (existing.length === 0) {
                // Insert new record
                await pool.query(
                    `INSERT INTO emagazine
                    (year, month, audio, img, created_at, author, description, category, details, title, shortDesc) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        magazineData.year,
                        magazineData.month,
                        magazineData.audio,
                        magazineData.img,
                        magazineData.created_at,
                        magazineData.author,
                        magazineData.description,
                        magazineData.category,
                        magazineData.details,
                        magazineData.title,
                        magazineData.shortDesc
                    ]
                );
            } else {
                // Update existing record
                await pool.query(
                    `UPDATE emagazine SET 
                    audio = ?, 
                    img = ?, 
                    created_at = ?, 
                    author = ?, 
                    description = ?, 
                    category = ?, 
                    details = ?, 
                    title = ?, 
                    shortDesc = ?
                    WHERE year = ? AND month = ?`,
                    [
                        magazineData.audio,
                        magazineData.img,
                        magazineData.created_at,
                        magazineData.author,
                        magazineData.description,
                        magazineData.category,
                        magazineData.details,
                        magazineData.title,
                        magazineData.shortDesc,
                        magazineData.year,
                        magazineData.month
                    ]
                );
            }

            res.status(200).json({
                success: true,
                message: 'Magazine uploaded and saved to database successfully',
                magazine: magazineData
            });

        } catch (err) {
            console.error("Error uploading magazine:", err);
            res.status(500).json({ 
                message: err.message || 'Internal server error' 
            });
        }
    });

    router.post('/audio_upload', upload.fields([
        { name: 'cover', maxCount: 1 },
        { name: 'audio', maxCount: 1 }
    ]), async (req, res) => {
        try {
            // Validate required files and fields
            if (!req.files?.cover || !req.files?.audio) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Both cover image and audio file are required' 
                });
            }
    
            const { title, subtitle, category } = req.body;
            if (!title || !subtitle || !category) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Title, subtitle and category are required' 
                });
            }
    
            // Generate unique filenames with timestamps
            // const timestamp = Date.now();
            // const coverExtension = path.extname(req.files.cover[0].originalname);
            // const audioExtension = path.extname(req.files.audio[0].originalname);
            
            const coverPath = `images/${req.files.cover[0].originalname}`;
            const audioPath = `audio_files/${req.files.audio[0].originalname}`;
    
            // Upload files to GCS
            await Promise.all([
                uploadFileToGCS(
                    req.files.cover[0].buffer,
                    coverPath,
                    req.files.cover[0].mimetype
                ),
                uploadFileToGCS(
                    req.files.audio[0].buffer,
                    audioPath,
                    req.files.audio[0].mimetype
                )
            ]);
    
            // Insert metadata into database
            const [result] = await pool.query(
                `INSERT INTO audio 
                (title, subtitle, category, coverImage, audiofile) 
                VALUES (?, ?, ?, ?, ?)`,
                [
                    title,
                    subtitle,
                    category,
                    coverPath,
                    audioPath
                ]
            );
    
            res.status(200).json({
                success: true,
                message: 'Audio uploaded successfully',
                data: {
                    id: result.insertId,
                    title,
                    subtitle,
                    category,
                    coverUrl: coverPath,
                    audioUrl: audioPath
                }
            });
    
        } catch (err) {
            console.error("Error uploading audio:", err);
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