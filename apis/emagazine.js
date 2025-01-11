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
    router.get('/image_check', async (req,res)=>{
        try{
                console.log("API called");
                
                const signedUrl =await  bucket.file("images/Gnana_Amirtham.png").getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                })
                res.send(signedUrl[0]);

        }
        catch(err){
            return {"error":err}
        }
    })
    router.get('/magazine-yearwise', async (req, res) => {
        try {
            const [results] = await pool.query(`
                WITH RankedRows AS (
                    SELECT
                        img,
                        year,
                        ROW_NUMBER() OVER (PARTITION BY year ORDER BY year) AS row_num
                    FROM \`Jeevaa-dev\`.emagazine
                )
                SELECT img, year
                FROM RankedRows
                WHERE row_num = 1;
            `);
    
            // Generate signed URLs for images
            const signedResults = await Promise.all(results.map(async (e) => {
                try {
                    const signedUrl = await bucket.file(e.img).getSignedUrl({
                        action: 'read',
                        expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                    });
    
                    return {
                        ...e,  // Spread the existing data
                        imgUrl: signedUrl[0]  // Add signed URL to the result
                    };
                } catch (err) {
                    console.error('Error generating signed URL for', e.img, err);
                    return null;  // Return null if error occurs while generating signed URL
                }
            }));
    
            // Filter out null values (in case there were errors)
            const finalResults = signedResults.filter(result => result !== null);
    
            res.send(finalResults);
    
        } catch (err) {
            console.error('Error fetching magazine data:', err);
            res.status(500).send({ error: err.message });
        }
    });
    
    


    router.get('/magazine-monthwise', async (req, res) => {
        try {
            const [results] = await pool.query(`
                SELECT img, month 
                FROM \`Jeevaa-dev\`.emagazine
                WHERE year = ?`, [req.query.year]);
    
            const signedResults = await Promise.all(results.map(async (e) => {
                const file = bucket.file(e.img); 
    
                // Check if file exists before generating signed URL
                const exists = await file.exists();
                if (!exists[0]) {
                    console.error(`File ${e.img} does not exist in the bucket.`);
                    return null;
                }
    
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 360 * 60 * 1000  // 6 hour expiration
                });
    
                return {
                    ...e,
                    imgUrl: signedUrl  // Add signed URL to the result
                };
            }));
    
            res.send(signedResults.filter(result => result !== null));  // Filter out null values
    
        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });
    
    // Route to get magazine details by year and month
    router.get("/magazine-details", async (req, res) => {
        const { year, month } = req.query;
    
        // Validate parameters
        if (!year || !month) {
            return res.status(400).json({ error: "Missing required parameters: year and month" });
        }
    
        const query = 'SELECT * FROM `Jeevaa-dev`.emagazine WHERE year = ? AND month = ?';
        try {
            const [results] = await pool.query(query, [year, month]);
    
            // Generate signed URLs for images
            const signedResults = await Promise.all(results.map(async (e) => {
                const signedUrl = await bucket.file(e.img).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                return {
                    ...e,  // Spread the existing data
                    imgUrl: signedUrl[0]  // Add signed URL to the result
                };
            }));
    
            res.send(signedResults);
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: "Internal Server Error" });
        }
    });
    
    
    // Route for getting next/previous magazine details
    router.get("/audio-prev-nxt-details", async (req, res) => {
        try {
            const query = `
                (SELECT img, title, 'prev' AS month  
                FROM \`Jeevaa-dev\`.emagazine
                WHERE (month + 1 = (SELECT month FROM \`Jeevaa-dev\`.emagazine WHERE id = ?)) 
                AND (year = (SELECT year FROM \`Jeevaa-dev\`.emagazine WHERE id = ?))) AS a
                UNION ALL
                (SELECT img, title, 'nxt' AS month  
                FROM \`Jeevaa-dev\`.emagazine
                WHERE (month - 1 = (SELECT month FROM \`Jeevaa-dev\`.emagazine WHERE id = ?)) 
                AND (year = (SELECT year FROM \`Jeevaa-dev\`.emagazine WHERE id = ?))) AS b
            `;
    
            const [results] = await pool.query(query, [req.query.bid, req.query.bid, req.query.bid, req.query.bid]);
    
            // Generate signed URLs for each image
            const signedResults = await Promise.all(results.map(async (e) => {
                const signedUrl = await bucket.file(e.img).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                return {
                    ...e,
                    imgUrl: signedUrl[0]  // Add signed URL to the result
                };
            }));
    
            res.send(signedResults);
        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });
    
    

    router.get('/audiofile', async (req, res) => {
        try {
            const today = new Date().toISOString().slice(0, 10);
    
            const plan_query = `
                SELECT 
                    CASE WHEN exp_dt > ? THEN plan ELSE 'basic' 
                    END AS plan 
                FROM \`Jeevaa-dev\`.users
                WHERE id = ?`;
    
            const [planResult] = await pool.query(plan_query, [today, req.query.uid]);
            const plan = planResult && planResult.length > 0 ? planResult[0].plan : 'basic';
    
            let query = `
                SELECT audioFiles 
                FROM \`Jeevaa-dev\`.emagazine 
                WHERE id = ?`;
            const [results] = await pool.query(query, [req.query.bid]);
    
            // Generate signed URLs for audio files
            const signedResults = await Promise.all(results.map(async (e, i) => {
                const file = bucket.file(e.audioFiles);
    
                // Check if the file exists in Google Cloud Storage
                const exists = await file.exists();
                if (!exists[0]) {
                    console.error(`File ${e.audioFiles} does not exist in the bucket.`);
                    return {
                        title: e.title,
                        audio: "",
                        transcript: e.transcript || ""
                    };
                }
    
                // Generate a signed URL for the audio file
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                if (plan === 'basic' && i === 0) {
                    // For basic plan, only allow the first file to have audio URL
                    return {
                        title: e.title,
                        audio: signedUrl,
                        transcript: e.transcript || ''
                    };
                } else {
                    // For other plans, allow all audio files
                    return {
                        title: e.title,
                        audio: signedUrl,
                        transcript: e.transcript || ''
                    };
                }
            }));
    
            res.send(signedResults);
        } catch (err) {
            console.error("Error fetching audio file data:", err);
            res.status(500).send({ error: err.message });
        }
    });
    
    
    
    router.post("/payment-success", async (req, res) => {
        const { razorpay_payment_id, plan, amount } = req.body;
      
        try {
          // Save payment details to the database
          await db.query(
            "INSERT INTO subscriptions (payment_id, plan, amount, user_id, status) VALUES (?, ?, ?, ?, ?)",
            [razorpay_payment_id, plan, amount, req.user.id, "active"] // Use user ID from session or token
          );
      
          res.status(200).json({ message: "Subscription updated successfully" });
        } catch (error) {
          console.error("Error updating subscription:", error);
          res.status(500).json({ message: "Failed to update subscription" });
        }
      });




    
    /** APIs to buy book hardcopies */

    
    
    

    return router
}