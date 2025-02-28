const router = require('express').Router();

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
    router.get("/active-users", async (req, res) => {
        try {
            // Ensure you're comparing sub_to with today's date
            const query = 'SELECT * FROM crm_users WHERE sub_to >= CURDATE()';

            // Execute the query
            const [results] = await pool.query(query);

            // Send back the results
            res.send(results);
        } catch (err) {
            console.error("Error fetching CRM users:", err);
            res.sendStatus(500).send("Internal Error");
        }
    });

    router.get("/expired-users", async (req, res) => {
        try {
            // Ensure you're comparing sub_to with today's date
            const query = 'SELECT * FROM crm_users WHERE sub_to < CURDATE()';

            // Execute the query
            const [results] = await pool.query(query);
            // console.log("results", results);
            
            // Send back the results
            res.send(results);
        } catch (err) {
            console.error("Error fetching CRM users:", err);
            res.sendStatus(500).send("Internal Error");
        }
    });

    router.get("/deleted-users", async (req,res)=>{
        try{
            const query = "select * from archive_crm";
            const [results] = await pool.query(query);
            res.send(results);
        }
        catch(err){
            res.sendStatus(500).send("Internal Error");
        }
    })

    router.post("/add-member", async (req, res)=>{
        try{
            const {name, mobile, email, street, district, pincode, sub_from, sub_to } = req.body
            let query = `INSERT INTO crm_users (name, mobile, email, street, district, pincode, sub_from, sub_to, book, type )
VALUES (?, ?, ?,?, ?, ?, ?, ?,'jeeva amirtham', 1);`
            const [results] = await pool.query(query, [name, mobile, email, street, district, pincode, sub_from, sub_to ])
            res.json(results)
        }
        catch (err) {
            console.error("Error fetching CRM users:", err);
            res.sendStatus(500).send("Internal Error");
        }
    })
    router.put("/update-member", async (req, res) => {
        try {
            const updatedData = req.body; 
    
            console.log(updatedData);
    
            // Construct the SQL query to update the member details
            const query = `
                UPDATE crm_users
                SET 
                    name = ?, 
                    street = ?, 
                    district = ?, 
                    pincode = ?, 
                    mobile = ?, 
                    email = ?, 
                    type = ?, 
                    book = 'jeeva amirdham', 
                    sub_from = ?, 
                    sub_to = ?
                WHERE id = ?
            `;
    
            // Execute the query with the updated data and the `id`
            const [results] = await pool.query(query, [
                updatedData.name || '',
                updatedData.street || '',
                updatedData.district || '',
                updatedData.pincode || '',
                updatedData.mobile || '',
                updatedData.email || '',
                updatedData.type  || '', 
                updatedData.sub_from  || null,
                updatedData.sub_to  || null,
                updatedData.id
            ]);
    

            if (results.affectedRows > 0) {
                // Respond with a success message
                res.status(200).json({ message: 'Member updated successfully' });
            } else {
                // If no rows were updated, the member was not found
                res.status(404).json({ message: 'Member not found' });
            }
        } catch (err) {
            console.error("Error fetching CRM users:", err);
            // Handle internal errors and send a response
            res.status(500).send("Internal Error");
        }
    });

    router.put("/move-to-expired/:memberId", async (req, res) => {
        try {
            const { memberId } = req.params;
    
            // Update the user's subscription end date to a past date (e.g., yesterday)
            const query = `
                UPDATE crm_users
                SET sub_to = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
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

    router.put("/move-to-active/:memberId", async (req, res) => {
        try {
            const { memberId } = req.params;
    
            // Update the user's subscription end date to a past date (e.g., yesterday)
            const query = `
                UPDATE crm_users
                SET sub_to = DATE_ADD(CURDATE(), INTERVAL 12 MONTH)
                WHERE id = ?
            `;
    
            // Execute the query
            const [results] = await pool.query(query, [memberId]);
    
            // Check if the user was updated
            if (results.affectedRows > 0) {
                res.status(200).json({ message: 'User moved to active successfully' });
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (err) {
            console.error("Error moving user to active:", err);
            res.status(500).send("Internal Error");
        }
    });


    router.delete("/delete-member/:memberId", async (req, res) => {
        try {
            const { memberId } = req.params;
            
            // Push the user to archive table
            const archive_query = `
                INSERT INTO archive_crm
                SELECT * FROM crm_users
                WHERE id = ?
            `;
            await pool.query(archive_query, [memberId]);
            // Delete the user from the database
            const query = `
                DELETE FROM crm_users
                WHERE id = ?
            `;
    
            // Execute the query
            const [results] = await pool.query(query, [memberId]);
    
            // Check if the user was deleted
            if (results.affectedRows > 0) {
                res.status(200).json({ message: 'User deleted successfully' });
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (err) {
            console.error("Error deleting user:", err);
            res.status(500).send("Internal Error");
        }
    });
    
    return router;
};
