const express = require('express')
const pool = require("./connection")
const cors = require('cors')



const app = express()
const port = 3001;

app.use(cors())

app.post('/create_user', async (req, res) => {
    try {
        const { name, email, ph, plan, googleId, facebookId } = req.body;

        if (!email && !ph && !googleId && !facebookId) {
            return res.status(400).send({ error: 'At least one login method (email, phone, googleId, facebookId) is required' });
        }

        let user;
        

        if (email) {
            [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE email = ?', [email]);
        } else if (ph) {
            [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE ph_no = ?', [ph]);
        } else if (googleId) {
            [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE google_id = ?', [googleId]);
        } else if (facebookId) {
            [user] = await pool.promise().query('SELECT * FROM `Jeeva-dev`.users WHERE facebook_id = ?', [facebookId]);
        }

        if (user && user.length > 0) {
            return res.json({ message: 'User found', user: user[0] });
        }

        // If the user doesn't exist, create a new user
        // Generate a new custom ID
        const [lastUser] = await pool.promise().query('SELECT id FROM `Jeeva-dev`.users ORDER BY id DESC LIMIT 1');
        let newId;
        if (lastUser.length === 0) {
            newId = 'JM-00001';
        } else {
            const lastId = lastUser[0].id;
            const numberPart = parseInt(lastId.split('-')[1], 10);
            const incrementedId = numberPart + 1;
            newId = `JM-${String(incrementedId).padStart(5, '0')}`;
        }

        // Insert the new user into the database with the custom ID
        const query = `
            INSERT INTO \`Jeeva-dev\`.users (id, name, email, ph_no, google_id, facebook_id, plan)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.promise().query(query, [newId, name, email || null, ph || null, googleId || null, facebookId || null, plan]);

        res.json({ message: 'New user created successfully', user: { id: newId, name, email, ph, plan } });

    } catch (err) {
        console.error(err); 
        res.status(500).send({ error: 'Internal Server Error', details: err.message });
    }
});

app.get('/getPlan', async (req,res)=>{
    try{
        const today = new Date().toISOString().slice(0, 10);
        const query = `SELECT plan FROM \`Jeeva-dev\`.user_magazine_sales
                        where u_id =? and exp_dt < ?`
        const [results] = await pool.query(query, [req.params.id, today])
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

pool.getConnection().then(
    ()=>{
        app.use('/emagazine-page', require('./apis/emagazine')(pool));
        app.listen(port, ()=>{console.log("connected to database")})
    }
).catch(err=>{
    console.log("failed to connect to db",err);
    process.exit(1)
})