const router = require('express').Router();

module.exports = (pool, bucket) => {
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
    router.put("/update-member/:id", async (req, res) => {
        try {
            const id = req.params.id; 
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
                updatedData.name,
                updatedData.street,
                updatedData.district,
                updatedData.pincode,
                updatedData.mobile,
                updatedData.email,
                updatedData.type, 
                updatedData.sub_from,
                updatedData.sub_to,
                id
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
    
    return router;
};
