const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const router = require("express").Router()
module.exports = (pool)=> {
    router.post('/authenticate', async (req, res) => {
        const { email, password } = req.body;
        const secretKey = crypto.randomBytes(64).toString("hex");
      
        try {
          // Find user by email
          const [rows] = await pool.query("SELECT * FROM admin_users WHERE email = ?", [email]);
          const user = rows[0];
      
          if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
          }
      
          // Compare passwords
          const isPasswordValid = await bcrypt.compare(password, user.password);
          if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
          }
      
          // Generate JWT
          const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            secretKey, 
            { expiresIn: "1h" } // Token expires in 1 hour
          );
      
          res.json({ token });
        } catch (error) {
          console.error("Login error:", error);
          res.status(500).json({ message: "Server error" });
        }
      })

      router.post('/change-password', async (req, res) => {
        const { email, currentPassword, newPassword } = req.body;

        try {
            // 1. Verify the user exists
            const [userRows] = await pool.query("SELECT * FROM admin_users WHERE email = ?", [email]);
            const user = userRows[0];
            
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            // 2. Verify current password
            const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: "Current password is incorrect" });
            }

            // 3. Hash the new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // 4. Update the password in the database
            await pool.query("UPDATE admin_users SET password = ? WHERE email = ?", [hashedPassword, email]);

            // 5. Respond with success
            res.json({ message: "Password changed successfully" });
            
        } catch (error) {
            console.error("Password change error:", error);
            res.status(500).json({ message: "Error changing password" });
        }
    });
      return router
}
