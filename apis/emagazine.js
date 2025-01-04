const router = require('express').Router()
const AWS = require('aws-sdk')
require('dotenv').config()
const s3 = new AWS.S3()
module.exports = (pool) => {

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
            const signedResults = results.map(e => {
                const signedUrl = s3.getSignedUrl('getObject', {
                    Bucket: process.env.BUCKET,  // S3 bucket name
                    Key: e.img,                  // S3 key for the image
                    Expires: 60 * 60             // 1 hour expiration
                });
                return {
                    ...e,  // Spread the existing data
                    imgUrl: signedUrl             // Add signed URL to the result
                };
            });
    
            res.send(signedResults);
        } catch (err) {
            res.send({ error: err });
        }
    });
    
    router.get('/magazine-monthwise', async (req, res) => {
        try {
            const [results] = await pool.query(`
                SELECT img, month 
                FROM \`Jeevaa-dev\`.emagazine
                WHERE year = ?`, [req.query.year]);
    
            // Generate signed URLs for images
            const signedResults = results.map(e => {
                const signedUrl = s3.getSignedUrl('getObject', {
                    Bucket: process.env.BUCKET,  // S3 bucket name
                    Key: e.img,                  // S3 key for the image
                    Expires: 60 * 60             // 1 hour expiration
                });
                return {
                    ...e,  // Spread the existing data
                    imgUrl: signedUrl             // Add signed URL to the result
                };
            });
    
            res.send(signedResults);
        } catch (err) {
            res.send({ error: err });
        }
    });
    
    
    router.get("/magazine-details", async (req, res) => {
        const { year, month } = req.query;
    
        // Validate parameters
        if (!year || !month) {
            return res.status(400).json({ error: "Missing required parameters: year and month" });
        }
    
        const query = 'SELECT * FROM `Jeeva-dev`.emagazine WHERE year = ? AND month = ?';
        try {
            const [results] = await pool.query(query, [year, month]);
    
            // Generate signed URLs for images
            const signedResults = results.map(e => {
                const signedUrl = s3.getSignedUrl('getObject', {
                    Bucket: process.env.BUCKET,  // S3 bucket name
                    Key: e.img,                  // S3 key for the image
                    Expires: 60 * 60             // 1 hour expiration
                });
                return {
                    ...e,  // Spread the existing data
                    imgUrl: signedUrl             // Add signed URL to the result
                };
            });
    
            res.send(signedResults);
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: "Internal Server Error" });
        }
    });
    


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
            const signedResults = results.map(e => {
                const signedUrl = s3.getSignedUrl('getObject', {
                    Bucket: process.env.BUCKET,  // Use your S3 bucket name
                    Key: e.img,                  // S3 key for the image
                    Expires: 60 * 60             // 1 hour expiration
                });
                return {
                    ...e,  // Spread the existing data
                    imgUrl: signedUrl             // Add signed URL to the result
                };
            });
    
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
                FROM \`Jeeva-dev\`.users
                WHERE id = ?`;
    
            const [planResult] = await pool.query(plan_query, [today, req.query.uid]);
            const plan = planResult && planResult.length > 0 ? planResult[0].plan : 'basic';
    
            let query = `
                SELECT audioFiles 
                FROM \`Jeeva-dev\`.emagazine 
                WHERE id = ?`;
            const [results] = await pool.query(query, [req.query.bid]);
    
            res.send(plan === 'basic' ? results.map((e, i) => {
                if (i === 0) {
                    return {
                        title: e.title,
                        audio: s3.getSignedUrl('getObject', {
                            Bucket: process.env.S3_BUCKET,
                            Key: e.audioFiles,
                            Expires: 60 * 60
                        }),
                        transcript: e.transcript || ''
                    };
                } else {
                    return {
                        title: e.title,
                        audio: "",
                        transcript: ""
                    };
                }
            }) 
            : 
            results.map((e) => {
                return {
                    title: e.title,
                    audio: s3.getSignedUrl('getObject', {
                        Bucket: process.env.S3_BUCKET,
                        Key: e.audioFiles,
                        Expires: 60 * 60
                    }),
                    transcript: e.transcript || ''
                }
            }
        ))
    
        } catch (err) {
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
       
    router.get('/books', async (req, res)=>{
        try{
            console.log("inside books api");
            
            const query = `select id, genre, title, subtitle, shortdesc, org_price, discount, disc_price, img from \`Jeeva-dev\`.book`
            const [results] = await pool.query(query)
            res.send(results)
        }
        catch (err){
            res.send({ error: err })
        }
    })

    router.get('/book-info', async(req,res)=>{
        try{
            const query = `select id, availability,author , genre, title, shortdesc, disc_price, img, description, additionalInfo, favorite from \`Jeeva-dev\`.book
                            where id = ${req.query.id}`
            const [results] = await pool.query(query)
            res.send(results)
        }
        catch (err){
            res.send({ error: err })
        }
    })


    return router
}