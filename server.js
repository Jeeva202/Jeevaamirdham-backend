const express = require('express')
const pool = require("./connection")
const cors = require('cors')
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const Razorpay = require('razorpay');
// const razorpayInstance = new Razorpay({
//   key_id: 'YOUR_RAZORPAY_KEY_ID', // Your Razorpay Key ID
//   key_secret: 'YOUR_RAZORPAY_KEY_SECRET' // Your Razorpay Key Secret
// });     


const app = express()
const port = 3001;
app.use(express.json());
app.use(cors())

const { Storage } = require('@google-cloud/storage');

const projectId = process.env.PROJECT_ID;
const storage = new Storage({
    keyFilename: "./key.json"
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
        if (user[0].length != 0) {
            return res.json({ userExists: true, id: user[0][0].id });
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
        console.log(name, email, ph, plan, googleId, facebookId);

        if (!email && !ph && !googleId && !facebookId) {
            return res.status(400).send({ error: 'At least one login method (email, phone, googleId, facebookId) is required' });
        }


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
        const created_date = today.toISOString().slice(0, 10)
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

app.get('/getPlan', async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const query = `SELECT plan FROM users
                        where id =? and expiry_dt > ?`

        const [results] = await pool.query(query, [req.query.id, today])

        res.send(results)
    }
    catch (err) {
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})
app.post('/setPlan', async (req, res) => {
    try {
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
    catch (err) {
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})


app.get('/blogs', async (req, res) => {
    try {
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
    catch (err) {
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})

app.get('/todays-thoughts', async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        console.log(today, new Date())
        const [todayThoughts] = await pool.query(
            'SELECT * FROM todaysThoughts WHERE date = ? ORDER BY id LIMIT 3',
            [today]
        );

        if (todayThoughts.length > 0) {
            console.log('Fetched thoughts:', todayThoughts);
            return res.json(todayThoughts);
        }

        const [randomThoughts] = await pool.query(
            'SELECT * FROM todaysThoughts ORDER BY RAND() LIMIT 3'
        );
        console.log('random thoughts:', randomThoughts);
        res.json(randomThoughts);
    } catch (err) {
        console.error('Error fetching thoughts:', err);
        res.status(500).json({ error: 'Failed to fetch thoughts' });
    }
});

app.get('/getUserDetails', async (req, res)=>{
    try{
        const {userId} = req.query;
        console.log("userId", userId);
        
        const [results] = await pool.query('SELECT f_name as firstName, l_name as lastName, gender, dob, phone_number as phone, email, door_no as doorNo, street_name as streetName, city, state, country, zip as zipCode FROM users WHERE id = ?', [userId]);
        res.send(results);
    }
    catch(err){
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
})

app.post('/updateUserDetails', async (req, res) => {
    try {
        const {
            userId,
            firstName,
            lastName,
            gender,
            dob,
            phone,
            email,
            doorNo,
            streetName,
            city,
            state,
            country,
            zipCode,
        } = req.body; // Get the data sent from the client
        console.log("body", req.body);
        
        // SQL query to update user details
        const updateQuery = `
            UPDATE users 
            SET f_name = ?, l_name = ?, gender = ?, dob = ?, phone_number = ?, 
                email = ?, door_no = ?, street_name = ?, city = ?, state = ?, 
                country = ?, zip = ?
            WHERE id = ?
        `;
        const validDob = dob && !isNaN(Date.parse(dob)) ? dob : null;
        // Execute the query with the new data and the user ID
        const [results] = await pool.query(updateQuery, [
            firstName || '',
            lastName || '',
            gender || '',
            validDob,
            phone || '',
            email || '',
            doorNo || '',
            streetName || '',
            city || '',
            state || '',
            country || '',
            zipCode || '',
            userId,
        ]);

        // Check if any row was affected (i.e., the user was updated)
        if (results.affectedRows > 0) {
            res.status(200).send({ message: 'User details updated successfully.' });
        } else {
            res.status(404).send({ message: 'User not found or no changes made.' });
        }
    } catch (err) {
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
});

app.post("/deactivate_user", async (req, res) => {
    try{
        const {userId} = req.body;
        await pool.query('INSERT INTO archive_users SELECT * FROM users WHERE id = ?', [userId]);
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        res.send({message: "User deleted successfully"});
    }
    catch (err){
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
}
)

pool.getConnection().then(
    () => {
        app.use('/emagazine-page', require('./apis/emagazine')(pool, bucket));
        app.use('/ebooks', require('./apis/ebook')(pool, bucket));
        app.use('/audio-video-page', require('./apis/audio_video_page')(pool, bucket));
        const loginRouter = require('./apis/login')(pool, bucket); // Import the login router
        app.use('/login', loginRouter); // Use the login router
        app.listen(port, () => { console.log("connected to database : " + port) })
    }
).catch(err => {
    console.log("failed to connect to db", err);
    process.exit(1)
})