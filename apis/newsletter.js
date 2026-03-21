const router = require('express').Router();
const nodemailer = require('nodemailer');

module.exports = (pool, bucket) => {
    // Nodemailer transporter (reusing settings from login.js)
    const transporter = nodemailer.createTransport({
        host: "smtpout.secureserver.net",
        port: 465,
        secure: true,
        auth: {
            user: "admin@jeevaamirdham.org",
            pass: "JAmirdham@30",
        },
    });

    // API to get all subscribed users
    router.get('/subscribed-users', async (req, res) => {
        try {
            // Try with schema if needed or just handle error
            const query = 'SELECT id, username, email FROM users WHERE sub_newsletter = 1 AND email IS NOT NULL AND email != \'\'';
            const [rows] = await pool.query(query);
            res.json(rows);
        } catch (err) {
            console.error('Error fetching subscribed users:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // API to send newsletter
    router.post('/send', async (req, res) => {
        const { subject, body, userEmails } = req.body;

        if (!subject || !body || !userEmails || userEmails.length === 0) {
            return res.status(400).json({ error: 'Subject, body, and at least one recipient are required' });
        }

        try {
            // In a production environment, you'd want to use a queue or BCC to handle many recipients
            // For now, we'll send it as a BCC to avoid exposing emails and keep it efficient
            const mailOptions = {
                from: `"JeevaAmirdham" <admin@jeevaamirdham.org>`,
                bcc: userEmails.join(','),
                subject: subject,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border: 1px solid #ddd; border-radius: 10px;">
                        <div style="text-align: center; margin-bottom: 20px;">
                             <img src="https://www.jeevaamirdham.in/static/media/jeevaamirdhamLogo.0937d2b10c788a56c7a743f43af2932a.svg" alt="Jeeva Logo" style="max-width: 150px; height: auto;">
                        </div>
                        <h2 style="color: #13493b;">${subject}</h2>
                        <div style="line-height: 1.6; color: #333; white-space: pre-wrap;">
                            ${body}
                        </div>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #999; text-align: center;">
                            You are receiving this because you subscribed to our newsletter at Jeeva Amirdham.
                        </p>
                    </div>
                `,
            };

            await transporter.sendMail(mailOptions);

            // Record the newsletter in the database
            const insertQuery = 'INSERT INTO newsletters (subject, body, recipient_count, sent_at) VALUES (?, ?, ?, NOW())';
            await pool.query(insertQuery, [subject, body, userEmails.length]);

            res.json({ message: 'Newsletter sent successfully' });
        } catch (err) {
            console.error('Error sending newsletter:', err);
            res.status(500).json({ error: 'Failed to send newsletter: ' + err.message });
        }
    });

    // API to get newsletter history
    router.get('/history', async (req, res) => {
        try {
            // First check if table exists, if not create it (simple migration)
            await pool.query(`
                CREATE TABLE IF NOT EXISTS newsletters (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    subject VARCHAR(255) NOT NULL,
                    body TEXT NOT NULL,
                    recipient_count INT DEFAULT 0,
                    sent_at DATETIME
                )
            `);

            const query = 'SELECT * FROM newsletters ORDER BY sent_at DESC LIMIT 50';
            const [rows] = await pool.query(query);
            res.json(rows);
        } catch (err) {
            console.error('Error fetching newsletter history:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
