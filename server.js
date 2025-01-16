const express = require('express')
const pool = require("./connection")
const cors = require('cors')
const Razorpay = require('razorpay');
// const razorpayInstance = new Razorpay({
//   key_id: 'YOUR_RAZORPAY_KEY_ID', // Your Razorpay Key ID
//   key_secret: 'YOUR_RAZORPAY_KEY_SECRET' // Your Razorpay Key Secret
// });     


const app = express()
const port = 3002;
app.use(express.json());
app.use(cors())

const { Storage } = require('@google-cloud/storage');

const projectId = process.env.PROJECT_ID; 
const storage = new Storage({
    keyFilename:"./key.json"
});  // Create a new Google Cloud Storage instance
const bucketName = process.env.BUCKET;
const bucket = storage.bucket(bucketName)

app.post('/check-user', async (req, res) => {
    console.log(req.body);
    
    const { email } = req.body;

    console.log(email);
    
    try {
      const user = await pool.query(`select id, username from \`Jeeva-dev\`.users where email = ?`, [email]);
      console.log("user", user);
      if (user[0].length !=0) {
        return res.json({ userExists: true, id:user[0][0].id });
      } else {
        return res.json({ userExists: false });
      }
    } catch (error) {
      console.error("Error checking user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
app.post('/create-user', async (req, res) => {
    try {
        const { name, email, ph, plan, googleId, facebookId } = req.body;
        console.log( name, email, ph, plan, googleId, facebookId );
        
        if (!email && !ph && !googleId && !facebookId) {
            return res.status(400).send({ error: 'At least one login method (email, phone, googleId, facebookId) is required' });
        }

        // let user;
        

        // if (email) {
        //     [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE email = ?', [email]);
        // } else if (ph) {
        //     [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE ph_no = ?', [ph]);
        // } else if (googleId) {
        //     [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE google_id = ?', [googleId]);
        // } else if (facebookId) {
        //     [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE facebook_id = ?', [facebookId]);
        // }

        // if (user && user.length > 0) {
        //     return res.json({ message: 'User found', user: user[0] });
        // }

        // If the user doesn't exist, create a new user
        // Generate a new custom ID
        const [lastUser] = await pool.query('SELECT id FROM `Jeeva-dev`.users ORDER BY id DESC LIMIT 1');
        let newId;
        console.log(lastUser);
        
        if (lastUser.length === 0) {
            newId = 1;
        } else {
            const lastId = lastUser[0].id;
            newId = lastId + 1
        }
        const today = new Date()
        const created_date = today.toISOString().slice(0,10)
        const expiryDate = new Date(today);
        expiryDate.setDate(today.getDate() + 30);
        const expiryDateFormatted = expiryDate.toISOString().slice(0, 10);
        // Insert the new user into the database with the custom ID
        const query = `
            INSERT INTO \`Jeeva-dev\`.users (id, username, email, phone_number, plan, created_dt, expiry_dt)
            VALUES (?, ?, ?, ?, 'basic',?,?)
        `;
        await pool.query(query, [newId, name, email || null, ph || null,
            //  googleId || null, facebookId || null,
            created_date, expiryDateFormatted]);

        res.json({ message: 'New user created successfully', user: { id: newId, name, email, ph, plan } });

    } catch (err) {
        console.error(err); 
        res.status(500).send({ error: 'Internal Server Error', message: err.message });
    }
});

app.get('/getPlan', async (req,res)=>{
    try{
        const today = new Date().toISOString().slice(0, 10);
        const query = `SELECT plan FROM users
                        where id =? and expiry_dt > ?`
        
        const [results] = await pool.query(query, [req.query.id, today])

        res.send(results)
    }
    catch(err){
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})
app.post('/setPlan', async (req, res)=>{
    try{
        const today = new Date().toISOString().slice(0, 10);
        const query = `
            UPDATE \`Jeeva-dev\`.user_magazine_sales 
            SET plan = ?, 
                EXP_DT = CASE 
                            WHEN ? = 'basic' THEN DATE_ADD(?, INTERVAL 30 DAY) 
                            ELSE DATE_ADD(?, INTERVAL 1 YEAR) 
                         END
            WHERE u_id = ?
        `;
        const [results] = await pool.query(query, [req.params.plan, req.params.plan, today, today, req.params.id]);
        res.send(results)
    }
    catch(err){
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})


app.get('/blogs', async (req, res)=>{
    try{
        const [getBlogs] = await pool.query('SELECT * FROM blogs')
        const signedResults = await Promise.all(getBlogs.map(async (blog) => {
            const signedUrl = await bucket.file(blog.img).getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
            });

            blog.imgUrl = signedUrl[0];  // Set the signed URL to the result object
            return blog;  // Return the updated book object with the signed URL
        }));

        res.send(signedResults);
    }
    catch(err){
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})

pool.getConnection().then(
    ()=>{
        app.use('/emagazine-page', require('./apis/emagazine')(pool, bucket));
        app.use('/ebooks', require('./apis/ebook')(pool, bucket));
        app.listen(port, ()=>{console.log("connected to database")})
    }
).catch(err=>{
    console.log("failed to connect to db",err);
    process.exit(1)
})