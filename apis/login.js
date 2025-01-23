const router = require('express').Router()
require('dotenv').config()
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const crypto = require('crypto');

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

// Utility functions

const hashPassword = (password) =>
    crypto.createHash("sha256").update(password).digest("hex");

// Ensure the hashed password length matches the database column length
const hashPasswordWithLengthCheck = (password) => {
    const hashedPassword = hashPassword(password);
    if (hashedPassword.length > 64) {
        throw new Error("Hashed password length exceeds the database column length");
    }
    return hashedPassword;
};

const sendOtpEmail = (email, otp, res, signedUrl) => {
    const mailOptions = {
        from: `"JeevaAmirdham" <admin@jeevaamirdham.org>`,
        to: email,
        subject: "Email Verification Required",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border: 1px solid #ddd; border-radius: 10px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05)">
                <!-- Logo Section -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="${signedUrl}" alt="Jeeva Logo" style="max-width: 150px; height: auto;">
                </div>
                <!-- Header Section -->
                <h1 style="text-align: center; color: #f39300; margin-bottom: 20px;">Verification Code</h1>
                <p style="text-align: center; color: #555; font-size: 16px; margin-bottom: 30px;">
                    Here is your login verification code: The code is valid for <strong>5 minutes</strong>.
                </p>
                <!-- OTP Code Section -->
                <div style="text-align: center; margin: 20px 0; background: linear-gradient(-90deg, rgba(240, 168, 0, 0.148) 60%, rgba(240,168,0,0.5) 100%); padding:1rem">
                    <p style="font-size: 25px; font-weight: bold; color: #f39300; margin: 0; letter-spacing: 7px">${otp}</p>
                </div>

            <!-- Footer Section -->
            <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 30px;">
                If you didn't request this email, you can safely ignore it.
                </p>
                <p style="color: #f39300;margin-top: 10px;text-align: center; font-size: 12px; font-weight: bold">Thanks Jeevaamirdham!</p>

            </div>
            <!-- Responsive Design -->
            <style>
                @media only screen and (max-width: 600px) {
                    div {
                        padding: 10px !important;
                    }
                    h1 {
                        font-size: 22px !important;
                    }
                    p {
                        font-size: 14px !important;
                    }
                }
            </style>
        `,
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to send OTP email." });
        }
        res.json({ message: "OTP sent successfully!" });
    });
};
module.exports = (pool,bucket) => {

    router.post("/find-user", async (req, res) => {
        try {
            const { email, username } = req.body;
            console.log("Received request to find user:", email);
            const query = "SELECT * FROM users WHERE email = ?";
            const [results] = await pool.query(query, [email]);
            // Check if the user exists
            if (results.length === 0) {
                return res.json({
                    isExistingUser: false,
                    isPasswordAvailable: false,
                    message: "User not found",
                });
            }
            const user = results[0];
            res.json({
                isExistingUser: true,
                isPasswordAvailable: !!user.password, // Check if the password is available
                isNewUserCreated: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                },
            });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: err.message });
        }
    });



    router.post("/send-otpToEmail", async(req, res) => {
        const { email, otp } = req.body;
        // const { otp } = req.body;
        console.log("Received request to send OTP to:", email, otp);
        try {
            const signedUrl = await bucket.file("images/jeevaamirdham_logo.png").getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000  // 1 hour expiration
            });
            // Send OTP to email (or SMS if applicable)
            console.log(signedUrl[0])
            sendOtpEmail(email, otp, res, signedUrl[0]);

            // Return OTP to client (Redux will store it)
            res.json({ message: "OTP sent successfully!", otp });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: err.message });
        }
    });

    router.post("/create-password", async (req, res) => {
        try {
            const { email, password, username } = req.body;
            const hashedPassword = hashPasswordWithLengthCheck(password);
    
            // Check if the user exists in the database
            const query = "SELECT id, password FROM users WHERE email = ?";
            const [results] = await pool.query(query, [email.trim()]);
    
            // If the user does not exist, create a new user and set password
            if (results.length === 0) {
                console.log("User not found, creating new user...");
    
                const [lastUser] = await pool.query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
                let newId = lastUser.length === 0 ? 1 : lastUser[0].id + 1;
    
                const today = new Date();
                const created_date = today.toISOString().slice(0, 10);
                const expiryDate = new Date(today);
                expiryDate.setDate(today.getDate() + 30);
                const expiryDateFormatted = expiryDate.toISOString().slice(0, 10);
    
                // Insert the new user into the database
                const insertUserQuery = `
                    INSERT INTO users (id, username, email, plan, created_dt, expiry_dt)
                    VALUES (?, ?, ?, 'basic', ?, ?)
                `;
                await pool.query(insertUserQuery, [newId, username, email.trim(), created_date, expiryDateFormatted]);
    
                // Re-fetch the newly inserted user to confirm
                const [newUserResult] = await pool.query("SELECT id FROM users WHERE email = ?", [email.trim()]);
                if (newUserResult.length === 0) {
                    return res.status(500).json({ error: "Failed to confirm new user creation." });
                }
    
                // Now update the password for the new user
                const addPasswordQuery = "UPDATE users SET password = ? WHERE email = ?";
                const [updateResult] = await pool.query(addPasswordQuery, [hashedPassword, email.trim()]);
    
                if (updateResult.affectedRows === 0) {
                    return res.status(400).json({ error: "Failed to set password. User not found." });
                }
    
                console.log("New user created and password successfully updated for email:", email.trim());
                return res.json({
                    success: true,
                    message: "New user created and password successfully updated!",
                    user: {
                        id: newId,
                        username,
                        email: email.trim(),
                        plan: 'basic',
                    },
                });
            }
    
            // If the user exists, update the password
            const user = results[0];
            const addPasswordQuery = "UPDATE users SET password = ? WHERE email = ?";
            const [updateResult] = await pool.query(addPasswordQuery, [hashedPassword, email.trim()]);
    
            if (updateResult.affectedRows === 0) {
                return res.status(400).json({ error: "Failed to set password. User not found." });
            }
    
            console.log("Password successfully updated for existing user:", email.trim());
            res.json({
                success: true,
                message: "Password successfully updated!",
                user: {
                    id: user.id,
                    username: username || "N/A", // Username may not exist for older users
                    email: email.trim(),
                    plan: 'basic',
                },
            });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: err.message });
        }
    });
    

    router.post("/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            const hashedPassword = hashPassword(password);
            console.log("Received request to login:", email, hashedPassword);
            const results = await pool.query("SELECT * FROM users WHERE email = ? AND password = ?", [email, hashedPassword]);
            if (results.length === 0) {
                return res.status(400).json({ error: "Invalid email or password." });
            }
            res.json({ message: "Login successful!", success: true, 
                user: { 
                    username: results[0][0].username, 
                    email: results[0][0].email, 
                    plan: results[0][0].plan, 
                    id: results[0][0].id 
                }});
        }
        catch (err) {
            console.error("Database error:", err);
            res.status(500).send({ error: err.message });
        }

    });

    router.post("/forgot-password", (req, res) => {
        const { email } = req.body;

        pool.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Database error." });
            }

            if (results.length === 0) {
                return res.status(400).json({ error: "Email not registered." });
            }

            const otp = generateOtp();
            const hashedOtp = hashPassword(otp);

            pool.query(
                "UPDATE users SET otp = ?, otp_expiry = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE email = ?",
                [hashedOtp, email],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: "Failed to update OTP." });
                    }
                    sendOtpEmail(email, otp, res);
                }
            );
        });
    });

    return router;
}