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
            const {name, mobile, email, street, state, district, pincode, sub_from, sub_to } = req.body
            let query = `INSERT INTO crm_users (name, mobile, email, street, state, district, pincode, sub_from, sub_to, book, type )
VALUES (?, ?, ?,?,?, ?, ?, ?, ?,'jeeva amirtham', 1);`
            const [results] = await pool.query(query, [name, mobile, email, street,state, district, pincode, sub_from, sub_to ])
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
    
    
            // Construct the SQL query to update the member details
            const query = `
                UPDATE crm_users
                SET 
                    name = ?, 
                    street = ?, 
                    state = ?,
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
                updatedData.state || '',
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
    
    router.get("/book-orders", async (req, res) => {
        try {
            // Ensure you're comparing sub_to with today's date
            const query = 'SELECT * FROM user_book_sales';

            // Execute the query
            const [results] = await pool.query(query);

            // Send back the results
            res.send(results);
        } catch (err) {
            console.error("Error fetching CRM users:", err);
            res.sendStatus(500).send("Internal Error");
        }
    });

    router.put('/book-orders/:id', async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
    
        try {
            await pool.query("UPDATE user_book_sales SET status = ? WHERE id = ?", [status, id]);
            res.json({ success: true, message: "Order status updated successfully" });
        } catch (error) {
            console.error("Error updating order status:", error);
            res.status(500).json({ success: false, message: "Failed to update status" });
        }
    });
    router.post('/book-orders/add', async (req, res) => {
        const {
            transaction_id,
            book_id,
            quantity,
            user_id,
            firstname,
            lastname,
            company,
            country,
            state,
            street,
            street2,
            city,
            zipcode,
            phone,
            email,
            notes,
            // full_address,
            status,
            created_at, 
            updated_at  
        } = req.body;
        const full_address = `${street} ${street2 ? street2 + ', ' : ''}${city}, ${state}, ${country}, ${zipcode}`;
        try {
            // Insert the new order into the database
            const result = await pool.query(
                `INSERT INTO user_book_sales (
                    transaction_id,
                    book_id,
                    quantity,
                    user_id,
                    firstname,
                    lastname,
                    company,
                    country,
                    state,
                    street,
                    street2,
                    city,
                    zipcode,
                    phone,
                    email,
                    notes,
                    full_address,
                    status,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    transaction_id,
                    book_id,
                    quantity,
                    user_id,
                    firstname,
                    lastname,
                    company,
                    country,
                    state,
                    street,
                    street2,
                    city,
                    zipcode,
                    phone,
                    email,
                    notes,
                    full_address,
                    status,
                    created_at,  // Using the date from form
                    updated_at   // Using the date from form
                ]
            );
    
            res.json({ 
                success: true, 
                message: "Order added successfully",
                // orderId: result.insertId
            });
        } catch (error) {
            console.error("Error adding new order:", error);
            res.status(500).json({ 
                success: false, 
                message: "Failed to add new order",
                error: error.message
            });
        }
    });

    return router;
};
