const router = require('express').Router()
const AWS = require('aws-sdk')
require('dotenv').config()
const axios = require('axios');
const nodemailer = require('nodemailer');
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

module.exports = (pool, bucket) => {
    router.post("/add_to_cart", async (req, res) => {
        const { userId, book, quantity } = req.body;

        let getquery = `SELECT cart_details FROM \`Jeeva-dev\`.users WHERE id = ?`;
        const [get_cart] = await pool.query(getquery, [userId]);

        let cart_details = get_cart[0]?.["cart_details"];

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
            console.log("data", data);

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
            console.log("data before removing item", data);

            // Remove the item from the cart array
            data = data.filter(item => {
                console.log(`Checking: item.book_id = ${item.book_id}, book_id = ${book_id}`);
                return item.book_id !== parseInt(book_id);
            });
            console.log("data after removing item", data);
            // Convert the updated array back to a JSON string
            const updatedCart = JSON.stringify(data);

            // Update the cart details in the database
            await pool.query(`UPDATE users SET cart_details = ? WHERE id = ?`, [updatedCart, userId]);
            const [new_data] = await pool.query(`select cart_details from users WHERE id = ?`, [userId]);
            // Send response with updated cart details
            res.json({
                message: "Item removed from cart",
                cart_details: new_data[0]["cart_details"]
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
            console.log(results);
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

    // router.get('/get-book-amount', async (req, res)=>{
    //     try{
    //         let amount_query = `select `
    //     }
    //     catch(err){
    //         console.error("Error updating cart:", error);
    //         res.status(500).json({ message: "Internal server error" });
    //     }
    // })
    router.post('/create-order', async (req, res) => {
        const { amount, user_id } = req.body;

        if (!amount || !user_id) {
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
                },
            };

            // Basic authentication using key_id and secret_key
            const auth = Buffer.from(`${key_id}:${secret_key}`).toString('base64');

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
    router.post('/payment-success', async (req, res) => {
        const { razorpay_payment_id, amount, user_id, userDetails } = req.body;

        if (!razorpay_payment_id || !amount || !user_id) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        // console.log("payment success", razorpay_payment_id, amount, user_id, userDetails, cartDetails);
        const [cartDetailsAPI] = await pool.query(`SELECT cart_details FROM users WHERE id = ?`, [user_id]);
        let cartDetails = JSON.parse(cartDetailsAPI[0].cart_details);
        // ===========================
        // Extract book IDs from cartDetails
        const bookIds = cartDetails.map(book => book.book_id);

        // Fetch book prices from the database
        const [bookPrices] = await pool.query(
            `SELECT id, title, offPrice FROM \`Jeeva-dev\`.book WHERE id IN (?)`,
            [bookIds]
        );

        // Create a mapping of book prices
        const priceMap = {};
        bookPrices.forEach(book => {
            priceMap[book.id] = { title: book.title, price: book.offPrice };
        });

        // Merge price and title into cartDetails
        cartDetails = cartDetails.map(book => ({
            ...book,
            title: priceMap[book.book_id]?.title || "Book Title",
            price: priceMap[book.book_id]?.price || "0.00"
        }));
        // ======================
        console.log("cartDetailsAPI", cartDetails);
        // Extract user details
        const {
            firstname, lastname, company, country, state, street, street2, city, zipcode, phone, email, notes
        } = userDetails;
        console.log("details", firstname, lastname, company, country, state, street, street2, city, zipcode, phone, email, notes);

        // Create a full address string
        const full_address = `${street} ${street2 ? street2 + ', ' : ''}${city}, ${state}, ${country}, ${zipcode}`;

        // Start database transaction
        try {
            // await pool.beginTransaction();

            // Insert the transaction into the orders table for each book in the cart
            for (const book of cartDetails) {
                const { book_id, quantity } = book;

                // Insert the order with user details into the database
                await pool.query(
                    `INSERT INTO user_book_sales 
                    (transaction_id, book_id, quantity, user_id, firstname, lastname, company, country, state, 
                    street, street2, city, zipcode, phone, email, notes, full_address) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
                    [
                        razorpay_payment_id,
                        book_id,
                        quantity,
                        user_id,
                        firstname,
                        lastname,
                        company || null,
                        country,
                        state,
                        street,
                        street2 || null,
                        city,
                        zipcode,
                        phone,
                        email,
                        notes || null,
                        full_address
                    ]
                );
            }

            // Remove from cart

            await pool.query(`UPDATE users SET cart_details = '[]' WHERE id = ?`, [user_id]);

            const signedUrl = await bucket.file("images/jeevaamirdham_logo.png").getSignedUrl({
                action: "read",
                expires: Date.now() + 60 * 60 * 1000, // 1-hour expiration
            });
            //send order mail
            await sendOrderEmail(email, firstname, lastname, cartDetails, razorpay_payment_id, full_address, signedUrl[0], phone);
            // Send success response
            res.status(200).json({ message: "Payment and order details saved successfully" });
        } catch (error) {
            console.error('Error while processing payment and saving order details:', error);
            res.status(500).json({ error: "An error occurred while processing the payment" });
        }
    });

    async function sendOrderEmail(userEmail, firstname, lastname, cartDetails, transactionId, address, signedUrl, phone) {
        // Nodemailer setup
        const transporter = nodemailer.createTransport({
            host: "smtpout.secureserver.net", // Outgoing SMTP server
            port: 465, // SSL Port for secure connection
            secure: true, // Use SSL
            auth: {
                user: "admin@jeevaamirdham.org", // Your email
                pass: "JAmirdham@30", // Your email password,
            },
        });

        // Generate PDF invoice
        const pdfPath = path.join(__dirname, `invoice_${transactionId}.pdf`);
        await generateInvoicePDF(pdfPath, firstname, lastname, cartDetails, transactionId, address, phone);

        const mailOptions = {
            from: `"JeevaAmirdham" <admin@jeevaamirdham.org>`,
            to: userEmail, // Send to the user
            cc: 'jeevaamirdhamweb@gmail.com', // CC to another email (admin)
            subject: 'Order Confirmation - Your Purchase was Successful!',
            html:
                `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; }
                .header { text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px 8px 0 0; }
                .logo { max-width: 150px; height: auto; }
                .content { padding: 25px; }
                .order-details { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
                .button { background-color: #007bff; color: white!important; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th { background-color: #f8f9fa; text-align: left; padding: 12px; }
                td { padding: 12px; border-bottom: 1px solid #e0e0e0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${signedUrl}" alt="Jeeva Logo" style="max-width: 150px; height: auto;">
                    <h1 style="color: #2c3e50; margin-top: 15px;">Invoice</h1>
                </div>

                <div class="content">
                    <p>Hi ${firstname.charAt(0).toUpperCase() + firstname.slice(1)} ${lastname.charAt(0).toUpperCase() + lastname.slice(1)},</p>

                    <p>Thank you for shopping with us! Your order has been successfully placed.</p>
                    
                    <div class="order-details">
                        <h3 style="margin-top: 0;">Order Summary</h3>
                        <p><strong>Name:</strong> ${firstname.charAt(0).toUpperCase() + firstname.slice(1)} ${lastname.charAt(0).toUpperCase() + lastname.slice(1)}</p>
                        <p><strong>Shipping Address:</strong><br>${address}</p>
                        <p><strong>Phone:</strong><br>${phone}</p>
                        
                        <h4>Items Ordered</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Book ID</th>
                                    <th>Title</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cartDetails.map(book => `
                                    <tr>
                                        <td>${book.book_id}</td>
                                        <td>${book.title || 'Book Title'}</td>
                                        <td>${book.quantity}</td>
                                        <td>Rs.${book.price || '00.00'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <p style="text-align: center; margin: 25px 0;">
                        <a href="https://www.jeevaamirdham.org/dashboard?tab=2" class="button">View Order Status</a>
                    </p>

                    <p>Need help? Reply to this email or contact us at <a href="mailto:admin@jeevaamirdham.org">admin@jeevaamirdham.org</a></p>
                </div>

            </div>
        </body>
        </html>
        `,
            attachments: [
                {
                    filename: `invoice_${transactionId}.pdf`,
                    path: pdfPath,
                    contentType: "application/pdf",
                },
            ],
        };

        try {
            await transporter.sendMail(mailOptions);
            // Delete the file after sending the email
            fs.unlinkSync(pdfPath);
            console.log('Order email sent successfully');
        } catch (error) {
            console.error('Error sending email:', error);
        }


    }
    // Function to generate invoice PDF
    async function generateInvoicePDF(filePath, firstname, lastname, cartDetails, transactionId, address, phone) {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const stream = fs.createWriteStream(filePath);

            doc.pipe(stream);

            doc.fontSize(20).text("JeevaAmirdham Order Invoice", { align: "center" });
            doc.moveDown();

            doc.fontSize(14).text(`Transaction ID: ${transactionId}`);
            doc.text(`Customer: ${firstname} ${lastname}`);
            doc.text(`Phone: ${phone}`);
            doc.text(`Shipping Address: ${address}`);
            doc.moveDown();

            doc.fontSize(16).text("Items Ordered:");
            doc.moveDown();

            cartDetails.forEach((book, index) => {
                doc.fontSize(12).text(`${index + 1}. ${book.title || "Book Title"} (Book ID: ${book.book_id})`);
                doc.text(`   Quantity: ${book.quantity}`);
                doc.text(`   Price: Rs.${book.price || "00.00"}`);
                doc.moveDown();
            });

            doc.end();
            stream.on("finish", resolve);
            stream.on("error", reject);
        });
    }



    return router;
};

