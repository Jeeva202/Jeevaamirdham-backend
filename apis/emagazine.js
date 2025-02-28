const router = require('express').Router()
require('dotenv').config()
const axios = require('axios')

async function updateLastRead (req, res, next){
    try{
        const {uid, year, month} = req.query;
        const [lastread] = await pool.query("select last_read from users where id = ?", [uid]);

        if(lastread.last_read == null || lastread.last_read == '[]'){
            await pool.query("update users set last_read = ? where id = ?", [JSON.stringify([{ year:year, month:month}]), uid])
        }
        else{
            let lastReadArray = JSON.parse(lastread.last_read);
            lastReadArray.unshift({year:year, month:month})
            await pool.query("update users set last_read = ? where id = ?", [JSON.stringify(lastReadArray.slice(0,2)), uid])

        }
    }
    catch(err){
        console.log(err);
    }
}
module.exports = (pool, bucket) => {
    router.get('/image_check', async (req,res)=>{
        try{
                // console.log("API called");
                
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
                    FROM emagazine
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
                FROM emagazine
                WHERE year = ?`, [req.query.year]);
    
            const signedResults = await Promise.all(results.map(async (e) => {
                const file = bucket.file(e.img); 
    
                // Check if file exists before generating signed URL
                const exists = await file.exists();
                if (!exists[0]) {
                    console.error(`File ${e.img} does not exist in the bucket.`);
                    // return null;
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
        // console.log(year, month);
        
        // Validate parameters
        if (!year || !month) {
            return res.status(400).json({ error: "Missing required parameters: year and month" });
        }
    
        const query = `SELECT 
    title, 
    author, 
    shortDesc, 
    description, 
    img, 
    category,
    details,
   created_dt, 
    'Jeeva Amirtham' as 'by' 
FROM emagazine 
WHERE year = ? AND month = ?;`;
        
        try {
            const [results] = await pool.query(query, [parseInt(year), parseInt(month)]);
            
            // Generate signed URLs for images and audio files
            const signedResults = await Promise.all(results.map(async (e) => {
                // Get signed URL for the image
                const signedImgUrl = await bucket.file(e.img).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
 
                return {
                    ...e,  // Retain the magazine data
                    imgUrl: signedImgUrl[0],  // Add signed URL for the image
                    // audio: signedAudioFiles  // Add the signed audio file URLs
                };
            }));
            // console.log(signedResults[0]);
            
            res.send(signedResults[0]);
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: "Internal Server Error" });
        }
    });
    
    router.get('/other-magazine-details', async (req, res) => {
        const { year, month } = req.query;
        // console.log(year, month);
        
        // Validate parameters
        if (!year || !month) {
            return res.status(400).json({ error: "Missing required parameters: year and month" });
        }
    
        const currentDate = new Date(year, month - 1); // JavaScript months are 0-indexed
        const magazines = [];
    
        // Function to get the month and year of the previous or next month
        function getAdjacentMonth(currDate, offset) {
            const newDate = new Date(currDate);
            newDate.setMonth(currDate.getMonth() + offset);
            return {
                year: newDate.getFullYear(),
                month: newDate.getMonth() + 1 // Adjust for 0-indexed months
            };
        }
    
        // Get 3 nearby magazines: 1, 2, and 3 months before or after
        const monthOffsets = [-3, -2, -1, 1, 2, 3];  // Get magazines 3 months before, 2, 1, 1 month after, 2, 3 months after
    
        try {
            const queryPromises = monthOffsets.map(async (offset) => {
                const { year: adjYear, month: adjMonth } = getAdjacentMonth(currentDate, offset);
                const query = `SELECT title, author, shortDesc, description, img, category,created_dt, 'Jeeva Amirtham' as 'by' 
                               FROM emagazine 
                               WHERE year = ? AND month = ?`;
                
                const [results] = await pool.query(query, [adjYear, adjMonth]);
                return results;
            });
    
            // Wait for all queries to complete
            const resultArrays = await Promise.all(queryPromises);
            
            // Flatten the array of results
            const allMagazines = resultArrays.flat();
    
            // Deduplicate and take the first 3
            const uniqueMagazines = allMagazines.slice(0, 3);
    
            // Generate signed URLs for images and audio files
            const signedResults = await Promise.all(uniqueMagazines.map(async (e) => {
                // Get signed URL for the image
                const signedImgUrl = await bucket.file(e.img).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                // Return the updated result with signed image URL
                return {
                    ...e,  // Retain the magazine data
                    imgUrl: signedImgUrl[0]  // Add signed URL for the image
                };
            }));
    
            // console.log(signedResults);
            
            res.send(signedResults);
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: "Internal Server Error" });
        }
    });
    
    
    
    router.get('/get-plan-amount', async (req, res) => {
        try {
            const { planName } = req.query;
    
            // Use parameterized queries to prevent SQL injection
            const query = 'SELECT price FROM plans WHERE name = ? LIMIT 1';
            // console.log(query, planName);
    
            // Execute the query using pool.query
            const [rows] = await pool.query(query, [planName]);
    
            // If no rows are returned, planName is invalid
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Plan not found' });
            }
    
            const price = rows[0].price;  // Access the price from the first row
            return res.json({ price });
        } catch (err) {
            console.error("DB error:", err);
            res.status(500).send({ error: "Internal Server Error occurred" });
        }
    });
    
    router.get('/get-plan-upgrade-amount', async (req, res) => {
        try {
            const { planName, userId } = req.query;
    
            const query = `SELECT 
                CASE 
                    WHEN (SELECT plan FROM users WHERE id = ?) != ? 
                    THEN 
                        (SELECT price FROM plans WHERE name = ?) - (SELECT price FROM plans WHERE name = (SELECT plan FROM users WHERE id = ?))
                    ELSE 
                        (SELECT price FROM plans WHERE name = (SELECT plan FROM users WHERE id = ?))
                END AS upgrade,
                CASE 
                    WHEN (SELECT plan FROM users WHERE id = ?) != ? 
                    THEN 'upgrade' 
                    ELSE 'renewal' 
                END AS purchase_type`;
    
            // Execute the query using pool.query
            const [rows] = await pool.query(query, [userId, planName, planName, userId, userId, userId, planName]);
            console.log("purchase_type", rows);
            
            // If no rows are returned, planName is invalid
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Plan not found' });
            }
    
            const { upgrade, purchase_type } = rows[0]; // Access both the upgrade price and purchase type
            return res.json({ price: upgrade, purchase_type });
        } catch (err) {
            console.error("DB error:", err);
            res.status(500).send({ error: "Internal Server Error occurred" });
        }
    });
    
    // Route for getting next/previous magazine details
    router.get("/audio-prev-nxt-details", async (req, res) => {
        try {
            const { year, selectedMonth } = req.query;  // year and selectedMonth as query params
    
            // Query to get all magazines for the specified year excluding the selected month
            const query = `
                SELECT img, title, year, month
                FROM emagazine
                WHERE year = ?
                AND month != ?  
                ORDER BY month
            `;
        
            // Execute the query to fetch all magazines for the given year, excluding the selected month
            const [results] = await pool.query(query, [year, selectedMonth]);
    
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
    
    
    

    // router.get('/audiofile', async (req, res) => {
    //     try {
    //         const today = new Date().toISOString().slice(0, 10);
    //         const { uid, year, month } = req.query;
    
    //         // Fetch the user's plan
    //         const plan_query = `
    //             SELECT 
    //                 CASE WHEN expiry_dt > ? THEN plan ELSE 'basic' 
    //                 END AS plan 
    //             FROM users
    //             WHERE id = ?`;
            
    //         const [planResult] = await pool.query(plan_query, [today, uid]);
    //         const plan = planResult && planResult.length > 0 ? planResult[0].plan : 'basic';
    
    //         // Query to fetch audio content for the given year and month
    //         let query = `
    //             SELECT audio
    //             FROM emagazine 
    //             WHERE year = ? AND month = ?`;
            
    //         const [results] = await pool.query(query, [parseInt(year), parseInt(month)]);
            
    //         // Parse the audio JSON content
    //         const audioContent = JSON.parse(results[0]["audio"]);
    //         console.log("audioContent",audioContent);
            
    //         // Map through each audio content
    //         const signedResults = await Promise.all(audioContent.map(async (e, i) => {
    
    //             const file = bucket.file(e.audioFile);
    //             const imgFile = bucket.file(e.pageImg)
    //             // Check if the file exists in Google Cloud Storage
    //             const exists = await file.exists();
    //             if (!exists[0]) {
    //                 console.error(`File ${e.audioFile} does not exist in the bucket.`);
    //                 return {
    //                     title: e.title,
    //                     audio: "",
    //                     transcript: "",
    //                     img:""
    //                 };
    //             }
    
    //             // Generate signed URL for the audio file
    //             const [signedUrl] = await file.getSignedUrl({
    //                 action: 'read',
    //                 expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
    //             });
    //             const [signedImg] = await imgFile.getSignedUrl({
    //                 action:'read',
    //                 expires:Date.now() + 60*60*1000
    //             })
    //             // For basic plan, only allow the first item to have audio URL
    //             if (plan === 'basic' && i === 0) {
    //                 return {
    //                     title: e.pageTitle,
    //                     audio: signedUrl,
    //                     transcript: e.pageContent || '',
    //                     img:e.pageImg
    //                 };
    //             } else if (plan === 'basic' && i > 0) {
    //                 // For basic plan, return empty audio URL for subsequent items
    //                 return {
    //                     title: e.pageTitle,
    //                     audio: "",
    //                     transcript: '',
    //                     img:''
    //                 };
    //             } else {
    //                 // For other plans, allow all audio files
    //                 return {
    //                     title: e.pageTitle,
    //                     audio: signedUrl,
    //                     transcript: e.pageContent || '',
    //                     img:e.signedImg
    //                 };
    //             }
    //         }));
    
    //         // Send the result to the frontend
    //         res.send(signedResults);
    //     } catch (err) {
    //         console.error("Error fetching audio file data:", err);
    //         res.status(500).send({ error: err.message });
    //     }
    // });
    
    
    router.get('/audiofile', updateLastRead, async (req, res) => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const { uid, year, month } = req.query;
            
            // Fetch the user's plan
            const plan_query = `
                SELECT 
                    CASE WHEN expiry_dt > ? THEN plan ELSE 'basic' 
                    END AS plan 
                FROM users
                WHERE id = ?`;
    
            const [planResult] = await pool.query(plan_query, [today, uid]);
            const plan = planResult && planResult.length > 0 ? planResult[0].plan : 'basic';
    
            // Query to fetch audio content for the given year and month
            let query = `
                SELECT audio
                FROM emagazine 
                WHERE year = ? AND month = ?`;
    
            const [results] = await pool.query(query, [parseInt(year), parseInt(month)]);
    
            // Parse the audio JSON content
            const audioContent = JSON.parse(results[0]["audio"]);
            console.log(audioContent);
    
            const signedResults = await Promise.all(audioContent.map(async (e, i) => {
                // Check if the file exists in Google Cloud Storage
                const file = bucket.file(e.audioFile);
                const imgFile = bucket.file(e.pageImg);
                const exists = await file.exists();
    
                if (!exists[0]) {
                    console.error(`File ${e.audioFile} does not exist in the bucket.`);
                }
    
                // Generate signed URL for the audio file
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                const [signedImg] = await imgFile.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000
                });
    
                if (plan === 'basic') {
                    if (i === 0) {
                        // For the first page, return audio and transcript if available, otherwise empty
                        if (e.audioFile && e.pageContent) {
                            return {
                                title: e.pageTitle,
                                audio: signedUrl,
                                transcript: e.pageContent || '',
                                img: signedImg
                            };
                        } else {
                            // If the audio or transcript is missing, return empty strings
                            return {
                                title: e.pageTitle,
                                audio: "",
                                transcript: "",
                                img: ""
                            };
                        }
                    } else {
                        // For all subsequent pages, return empty audio, transcript, and img
                        return {
                            title: e.pageTitle,
                            audio: "",
                            transcript: "",
                            img: ""
                        };
                    }
                } else {
                    // For non-basic plans, return all available audio, transcript, and img
                    return {
                        title: e.pageTitle,
                        audio: signedUrl,
                        transcript: e.pageContent || '',
                        img: signedImg
                    };
                }
            }));
    
            // Filter out null results (in case the audio file doesn't exist)
            const filteredResults = signedResults.filter(result => result !== null);
    
            // Send the result to the frontend
            res.send(filteredResults);
        } catch (err) {
            console.error("Error fetching audio file data:", err);
            res.status(500).send({ error: err.message });
        }
    });
    router.post('/create-order', async (req, res) => {
        const { amount, user_id, planName } = req.body;
    
        if (!amount || !user_id || !planName) {
            return res.status(400).json({ error: "Missing required fields" });
        }
    
        try {
            // Razorpay API credentials
            const key_id = process.env.RAZORPAY_KEY_ID;
            const secret_key = process.env.RAZORPAY_SECRET_KEY;
    
            // Create the Razorpay order here
            const options = {
                amount: amount * 100, // Amount in paise
                currency: "INR",
                receipt: `order_rcptid_${new Date().getTime()}`,
                notes: {
                    user_id: user_id,
                    plan_name: planName,
                },
            };
            console.log("keys", key_id, secret_key);
            
            // Basic authentication using key_id and secret_key
            const auth = Buffer.from(`${key_id}:${secret_key}`).toString('base64');
            console.log("auth", auth);
            
            // Create Razorpay order via API
            const response = await axios.post(
                'https://api.razorpay.com/v1/orders',
                options,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                    }
                }
            );
    
            const orderId = response.data.id;
    
            // Send the order ID to the frontend
            res.status(200).json({ orderId });
        } catch (error) {
            console.error("Error creating Razorpay order:", error);
            res.status(500).json({ error: "An error occurred while creating the Razorpay order" });
        }
    });
    
    router.post("/payment-success", async (req, res) => {
        const { razorpay_payment_id, plan, amount, user_id } = req.body;
      
        try {
            console.log("razor_pay", razorpay_payment_id, plan, amount, user_id);
            const today = new Date().toISOString().slice(0, 10);
          // Save payment details to the database
          await pool.query(
            "INSERT INTO user_magazine_sales (transac_id, plan, amount, u_id, status, purchase_dt) VALUES (?, ?, ?, ?, ?, ?)",
            [razorpay_payment_id, plan, amount, user_id, "completed", today] // Use user ID from session or token
          );
          console.log("plan", plan, "u_id", user_id);
          
          await pool.query(
            "UPDATE users SET plan = ?,expiry_dt = DATE_ADD(CURDATE(), INTERVAL 11 MONTH) WHERE id=?", [plan, user_id]
          )
      
          res.status(200).json({ message: "Subscription updated successfully" });
        } catch (error) {
          console.error("Error updating subscription:", error);
          res.status(500).json({ message: "Failed to update subscription" });
        }
      });

      router.post("/upgrade-renewal-success", async (req, res) => {
        const { razorpay_payment_id, plan, amount, user_id, purchaseType } = req.body;
      
        try {
            console.log("razor_pay", razorpay_payment_id, plan, amount, user_id, purchaseType);
            const today = new Date().toISOString().slice(0, 10);
                      // Save payment details to the database
          await pool.query(
            "INSERT INTO user_magazine_sales (transac_id, plan, amount, u_id, status, purchase_dt) VALUES (?, ?, ?, ?, ?,?)",
            [razorpay_payment_id, plan, amount, user_id, "completed", today] // Use user ID from session or token
          );
            if(purchaseType === 'upgrade'){
                console.log("inside upgrade");
                let [existingPlan] = await pool.query(`select plan from users where id = ?`,[user_id])
                if(existingPlan[0].plan === 'basic'){
                    await pool.query(
                        "UPDATE users set expiry_dt = DATE_ADD(CURDATE(), INTERVAL 11 MONTH), plan = ? where id=?", [plan, user_id]
                      )
                }
                else{
                    await pool.query(
                        "UPDATE users set plan = ? where id=?", [plan, user_id]
                      )
                }

            }
            else{
                await pool.query(
                    "UPDATE `Jeeva-dev`.users set expiry_dt = DATE_ADD(expiry_dt, INTERVAL 11 MONTH) where id=?", [user_id]
                )
            }


          console.log("");
          

      
          res.status(200).json({ message: "Subscription updated successfully" });
        } catch (error) {
          console.error("Error updating subscription:", error);
          res.status(500).json({ message: "Failed to update subscription" });
        }
      });


    
    /** APIs to buy book hardcopies */

    
    
    

    return router
}