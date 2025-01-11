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
    router.post("/add_to_cart", async (req, res) => {
        const { userId, book, quantity } = req.body;
        
        let getquery = `SELECT cart_details FROM \`Jeeva-dev\`.users WHERE id = ?`;
        const [get_cart] = await pool.query(getquery, [userId]);
        
        let cart_details = get_cart[0]["cart_details"];
        
        if (cart_details) {
            let data = JSON.parse(cart_details);
            const existingBookIndex = data.findIndex(item => item.book_id === book);
            
            if (existingBookIndex >= 0) {
                // Update the quantity if book exists
                data[existingBookIndex].quantity += quantity ? quantity : 1;
            } else {
                // Add the book if it's not in the cart
                data.push({ book_id: book, quantity: quantity ? quantity : 1 });
            }
            
            const string_data = JSON.stringify(data);
            await pool.query(`UPDATE \`Jeeva-dev\`.users SET cart_details = ? WHERE id = ?`, [string_data, userId]);
            
            res.json({
                "message": "Updated cart",
                cart_details: data
            });
        } else {
            // Create a new cart if cart_details is empty
            const newCart = [{ book_id: book, quantity: quantity ? quantity : 1 }];
            const string_new_cart = JSON.stringify(newCart);
            
            await pool.query(`UPDATE \`Jeeva-dev\`.users SET cart_details = ? WHERE id = ?`, [string_new_cart, userId]);
            
            res.json({
                "message": "Added to cart",
                cart_details: newCart
            });
        }
    });
    
    
    router.post("/remove_from_cart", async (req, res) => {
        const { userId, book_id } = req.body;
    console.log("api got called");
    
        // Get current cart details for the user
        let getQuery = `SELECT cart_details FROM \`Jeeva-dev\`.users WHERE id = ?`;
        const [getCart] = await pool.query(getQuery, [userId]);
    
        let cartDetails = getCart[0]["cart_details"];
    
        if (cartDetails) {
            let data = JSON.parse(cartDetails); // Parse the string into an array
    
            // Remove the item from the cart array
            data = data.filter(item => item.book_id !== book_id);
    
            // Convert the updated array back to a JSON string
            const updatedCart = JSON.stringify(data);
    
            // Update the cart details in the database
            await pool.query(`UPDATE \`Jeeva-dev\`.users SET cart_details = ? WHERE id = ?`, [updatedCart, userId]);
    
            // Send response with updated cart details
            res.json({
                message: "Item removed from cart",
                cart_details: data
            });
        } else {
            res.status(404).json({ message: "Cart not found for user" });
        }
    });
           
    router.get('/books', async (req, res) => {
        try {
            console.log("Inside books API");
    
            // Query to fetch the books
            const query = `SELECT id, title, subtitle, shortdesc, orgPrice, discount, offPrice, img FROM \`Jeeva-dev\`.book`;
            const [results] = await pool.query(query);
    
            // Map over the results to generate signed URLs for the images
            const signedResults = await Promise.all(results.map(async (book) => {
                const signedUrl = await bucket.file(book.img).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                book.imgUrl = signedUrl[0];  // Set the signed URL to the result object
                return book;  // Return the updated book object with the signed URL
            }));
    
            res.send(signedResults);
    
        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });
    

    router.get('/book-info', async (req, res) => {
        try {
            console.log("book-info called");
            
            const query = `
                SELECT id, availability, author, title, shortdesc, offPrice, img, description 
                FROM \`Jeeva-dev\`.book
                WHERE id = ${req.query.id}`;
    
            const [results] = await pool.query(query);
    
            if (results.length > 0) {
                const book = results[0]; // Get the first (and only) result
    
                const signedUrl = await bucket.file(book.img).getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
                });
    
                book.imgUrl = signedUrl[0];  // Set the signed URL to the result object
    
                res.send(book);
            } else {
                res.status(404).send({ error: "Book not found" });
            }
    
        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });

    router.get("/get_cart", async (req, res) => {
        const { id } = req.query; // Assuming user ID is passed as a query parameter
        try {
            const getCartQuery = `SELECT cart_details FROM users WHERE id = ?`;
            const [cartData] = await pool.query(getCartQuery, [id]);
            
            if (cartData.length > 0) {
                const cartDetails = JSON.parse(cartData[0].cart_details);
                res.json({ cart_details: cartDetails });
            } else {
                res.status(404).json({ message: "No cart found" });
            }
        } catch (error) {
            console.error("Error fetching cart:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });

    router.post("/update_quantity", async (req, res) => {
        const { userId, book_id, quantity } = req.body;
    
        try {
            // Get current cart details for the user
            let getQuery = `SELECT cart_details FROM users WHERE id = ?`;
            const [getCart] = await pool.query(getQuery, [userId]);
    
            let cartDetails = getCart[0].cart_details;
            if (cartDetails) {
                let data = JSON.parse(cartDetails); // Parse the string into an array
    
                // Find the book in the cart and update its quantity
                const bookIndex = data.findIndex(item => item.book_id === book_id);
                if (bookIndex !== -1) {
                    data[bookIndex].quantity = quantity;
                }
    
                // Update the cart in the database
                const updatedCart = JSON.stringify(data);
                await pool.query(`UPDATE users SET cart_details = ? WHERE id = ?`, [updatedCart, userId]);
    
                res.json({ message: "Cart updated", cart_details: data });
            } else {
                res.status(404).json({ message: "Cart not found for user" });
            }
        } catch (error) {
            console.error("Error updating cart:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });
    
    
    
    return router;
};

