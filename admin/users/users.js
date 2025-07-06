const router = require('express').Router();
const dayjs = require('dayjs');
module.exports = (pool, bucket) => {
    // router.get("/kpi", async (req, res)=>{
    //     try{
    //         const query = ` SELECT 'active' as var, count(*) as val FROM crm_users WHERE sub_to >= CURDATE()
    //                         UNION
    //                         SELECT 'expired' as var, count(*) as val FROM crm_users WHERE sub_to < CURDATE()
    //                         UNION
    //                         SELECT 'deleted' as var, count(*) as val FROM archive_crm`
    //         const [results] = await pool.query(query);
    //         res.send(results);
    //     }
    //     catch(err){
    //         res.sendStatus(500).send("Internal Error");
    //     }
    // })

    router.get('/stats', async (req, res) => {
        try {
            // Using await with the query
            const [results] = await pool.query(`
                SELECT 'basic' as type, COUNT(id) as count FROM users WHERE plan='basic' AND expiry_dt > CURDATE()
                UNION
                SELECT 'elite' as type, COUNT(id) as count FROM users WHERE plan='elite' AND expiry_dt > CURDATE()
                UNION
                SELECT 'premium' as type, COUNT(id) as count FROM users WHERE plan='premium' AND expiry_dt > CURDATE()
                UNION
                SELECT 'crm' as type, COUNT(id) as count FROM crm_users WHERE sub_to > CURDATE()
            `);
    
            // Transform the results into a more usable format
            const stats = results.reduce((acc, row) => {
                acc[`${row.type}Users`] = row.count;
                return acc;
            }, {});
    
            res.json({
                success: true,
                data: stats
            });
        } catch (err) {
            console.error("Error fetching user stats:", err);
            res.status(500).json({ 
                success: false,
                message: "Internal server error",
                error: err.message 
            });
        }
    });
    router.get('/active-users', async (req, res) => {
        try {
            const { userType } = req.query;
            if (!userType) {
                return res.status(400).json({ message: "userType parameter is required" });
            }

            const today = dayjs().format('YYYY-MM-DD');
            const sql = `
                SELECT * FROM users 
                WHERE plan = ? AND expiry_dt >= ?
                ORDER BY expiry_dt ASC
            `;
            const results = await pool.query(sql, [userType, today]);
            
            res.json(results[0]);
        } catch (error) {
            console.error("Error fetching active premium users:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });

    // GET expired premium users
    router.get('/expired-users', async (req, res) => {
        try {
            const { userType } = req.query;
            if (!userType) {
                return res.status(400).json({ message: "userType parameter is required" });
            }

            const today = dayjs().format('YYYY-MM-DD');
            const sql = `
                SELECT * FROM users 
                WHERE plan = ? AND expiry_dt < ?
                ORDER BY expiry_dt DESC
            `;
            const results = await pool.query(sql, [userType, today]);
            
            res.json(results[0]);
        } catch (error) {
            console.error("Error fetching expired premium users:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });

    // GET deleted premium users
    router.get('/deleted-users', async (req, res) => {
        try {
            const { userType } = req.query;
            if (!userType) {
                return res.status(400).json({ message: "userType parameter is required" });
            }

            const sql = `
                SELECT * FROM archive_users 
                WHERE plan = ?
            `;
            const results = await pool.query(sql, [userType]);
            console.log(sql, userType);
            console.log(results);
            
            res.send(results[0]);
        } catch (error) {
            console.error("Error fetching deleted premium users:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });

// POST /admin/users/add-premium-user
router.post('/add-premium-user', async (req, res) => {
    try {
        const {
            username,
            email,
            phone_number,
            f_name,
            l_name,
            gender,
            door_no,
            street_name,
            city,
            state,
            country,
            zip,
            expiry_dt,
            comments,
            userType
        } = req.body;

        // Basic validation
        if (!username || !email || !phone_number || !expiry_dt) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUser[0].length > 0) {
            return res.status(409).json({ message: "User with this email or username already exists" });
        }

        // Insert new premium user
        const result = await pool.query(
            `INSERT INTO users (
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                plan, created_dt, expiry_dt, comments
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
            [
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                userType, expiry_dt, comments
            ]
        );

        res.status(201).json({
            message: "Premium user added successfully",
            userId: result[0].insertId
        });
    } catch (error) {
        console.error("Error adding premium user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
// PUT /admin/users/update-premium-user
router.put('/update-premium-user', async (req, res) => {
    try {
        const {
            id,
            username,
            email,
            phone_number,
            f_name,
            l_name,
            gender,
            door_no,
            street_name,
            city,
            state,
            country,
            zip,
            expiry_dt,
            comments
        } = req.body;

        // Basic validation
        if (!id || !username || !email || !phone_number || !expiry_dt) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        // Check if user exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (existingUser[0].length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update premium user
        await pool.query(
            `UPDATE users SET
                username = ?,
                email = ?,
                phone_number = ?,
                f_name = ?,
                l_name = ?,
                gender = ?,
                door_no = ?,
                street_name = ?,
                city = ?,
                state = ?,
                country = ?,
                zip = ?,
                expiry_dt = ?,
                comments = ?
            WHERE id = ?`,
            [
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                expiry_dt, comments, id
            ]
        );

        res.status(200).json({ message: "Premium user updated successfully" });
    } catch (error) {
        console.error("Error updating premium user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

    router.put("/move-to-expired/:memberId", async (req, res) => {
        try {
            const { memberId } = req.params;
    
            // Update the user's subscription end date to a past date (e.g., yesterday)
            const query = `
                UPDATE users
                SET expiry_dt = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                WHERE id = ?
            `;
    
            // Execute the query
            const [results] = await pool.query(query, [memberId]);
    
            // Check if the user was updated
            if (results.affectedRows > 0) {
                res.status(200).json({ message: 'User moved to expired successfully' });
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (err) {
            console.error("Error moving user to expired:", err);
            res.status(500).send("Internal Error");
        }
    });

// PUT /admin/users/move-to-active/:userId
router.put('/move-to-active/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }
        const query = `
        UPDATE users
        SET expiry_dt = DATE_ADD(CURDATE(), INTERVAL 12 MONTH)
        WHERE id = ?
    `;
    const [results] = await pool.query(query, [userId]);
        console.log(results);
        
        res.status(200).json({ message: "User moved to active premium successfully" });
    } catch (error) {
        // Rollback on error
        // await pool.query('ROLLBACK');
        console.error("Error moving user to active:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// DELETE /admin/users/delete-premium-user/:userId
router.delete('/delete-premium-user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        // Check if user exists
        const user = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (user[0].length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Begin transaction
        await pool.query('START TRANSACTION');

        // Archive the user (without archived_at timestamp)
        await pool.query(
            `INSERT INTO archive_users 
            (id, username, email, phone_number, f_name, l_name, gender, 
             door_no, street_name, city, state, country, zip, 
             plan, created_dt, expiry_dt, comments)
            SELECT 
            id, username, email, phone_number, f_name, l_name, gender, 
            door_no, street_name, city, state, country, zip, 
            plan, created_dt, expiry_dt, comments
            FROM users WHERE id = ?`,
            [userId]
        );

        // Delete from users table
        await pool.query(
            'DELETE FROM users WHERE id = ?',
            [userId]
        );

        // Commit transaction
        await pool.query('COMMIT');

        res.status(200).json({ message: "Premium user archived successfully" });
    } catch (error) {
        // Rollback on error
        await pool.query('ROLLBACK');
        console.error("Error archiving premium user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
router.post('/add-elite-user', async (req, res) => {
    try {
        const {
            username,
            email,
            phone_number,
            f_name,
            l_name,
            gender,
            door_no,
            street_name,
            city,
            state,
            country,
            zip,
            expiry_dt,
            comments,
            userType
        } = req.body;

        // Basic validation
        if (!username || !email || !phone_number || !expiry_dt) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUser[0].length > 0) {
            return res.status(409).json({ message: "User with this email or username already exists" });
        }

        // Insert new elite user
        const result = await pool.query(
            `INSERT INTO users (
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                plan, created_dt, expiry_dt, comments
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
            [
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                userType, expiry_dt, comments
            ]
        );

        res.status(201).json({
            message: "elite user added successfully",
            userId: result[0].insertId
        });
    } catch (error) {
        console.error("Error adding elite user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
// PUT /admin/users/update-elite-user
router.put('/update-elite-user', async (req, res) => {
    try {
        const {
            id,
            username,
            email,
            phone_number,
            f_name,
            l_name,
            gender,
            door_no,
            street_name,
            city,
            state,
            country,
            zip,
            expiry_dt,
            comments
        } = req.body;

        // Basic validation
        if (!id || !username || !email || !phone_number || !expiry_dt) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        // Check if user exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (existingUser[0].length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update elite user
        await pool.query(
            `UPDATE users SET
                username = ?,
                email = ?,
                phone_number = ?,
                f_name = ?,
                l_name = ?,
                gender = ?,
                door_no = ?,
                street_name = ?,
                city = ?,
                state = ?,
                country = ?,
                zip = ?,
                expiry_dt = ?,
                comments = ?
            WHERE id = ?`,
            [
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                expiry_dt, comments, id
            ]
        );

        res.status(200).json({ message: "elite user updated successfully" });
    } catch (error) {
        console.error("Error updating elite user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
router.post('/add-basic-user', async (req, res) => {
    try {
        const {
            username,
            email,
            phone_number,
            f_name,
            l_name,
            gender,
            door_no,
            street_name,
            city,
            state,
            country,
            zip,
            expiry_dt,
            comments,
            userType
        } = req.body;

        if (!username || !email || !phone_number || !expiry_dt) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUser[0].length > 0) {
            return res.status(409).json({ message: "User already exists" });
        }

        const result = await pool.query(
            `INSERT INTO users (
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                plan, created_dt, expiry_dt, comments
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
            [
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                userType, expiry_dt, comments
            ]
        );

        res.status(201).json({
            message: "Basic user added successfully",
            userId: result[0].insertId
        });
    } catch (error) {
        console.error("Error adding basic user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// PUT /admin/users/update-basic-user
router.put('/update-basic-user', async (req, res) => {
    try {
        const {
            id,
            username,
            email,
            phone_number,
            f_name,
            l_name,
            gender,
            door_no,
            street_name,
            city,
            state,
            country,
            zip,
            expiry_dt,
            comments
        } = req.body;

        if (!id || !username || !email || !phone_number || !expiry_dt) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        const existingUser = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (existingUser[0].length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        await pool.query(
            `UPDATE users SET
                username = ?,
                email = ?,
                phone_number = ?,
                f_name = ?,
                l_name = ?,
                gender = ?,
                door_no = ?,
                street_name = ?,
                city = ?,
                state = ?,
                country = ?,
                zip = ?,
                expiry_dt = ?,
                comments = ?
            WHERE id = ?`,
            [
                username, email, phone_number, f_name, l_name, gender,
                door_no, street_name, city, state, country, zip,
                expiry_dt, comments, id
            ]
        );

        res.status(200).json({ message: "Basic user updated successfully" });
    } catch (error) {
        console.error("Error updating basic user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
// DELETE /admin/users/delete-basic-user/:userId
router.delete('/delete-basic-user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        await pool.query('START TRANSACTION');

        await pool.query(
            `INSERT INTO archive_users 
            (id, username, email, phone_number, f_name, l_name, gender, 
             door_no, street_name, city, state, country, zip, 
             plan, created_dt, expiry_dt, comments)
            SELECT 
            id, username, email, phone_number, f_name, l_name, gender, 
            door_no, street_name, city, state, country, zip, 
            plan, created_dt, expiry_dt, comments
            FROM users WHERE id = ? AND plan = 'basic'`,
            [userId]
        );

        await pool.query(
            'DELETE FROM users WHERE id = ? AND plan = \'basic\'',
            [userId]
        );

        await pool.query('COMMIT');

        res.status(200).json({ message: "Basic user archived successfully" });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Error archiving basic user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
    return router;
};
