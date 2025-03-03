// const bcrypt = require("bcryptjs");
// const pool = require("../../connection");

// const saltRounds = 10;

// const hashPassword = async (password) => {
//   const salt = await bcrypt.genSalt(saltRounds);
//   const hash = await bcrypt.hash(password, salt);
//   return hash;
// };

// const insertUser = async (email, password, role) => {
//   const hashedPassword = await hashPassword(password);

//   const query = `
//     INSERT INTO admin_users (email, password, role)
//     VALUES (?, ?, ?)
//   `;

//   try {
//     const [result] = await pool.query(query, [email, hashedPassword, role]);
//     console.log("User inserted:", result);
//   } catch (error) {
//     console.error("Error inserting user:", error);
//   }
// };

// // Insert a sample user
// insertUser("jeevaamirdhamweb@gmail.com", "newWorld@3040@garuda", "crm");
// insertUser("admin@jeevaamirdham.org", "newWorld@3040@garuda", "admin")