const express = require("express")
const app = express()
const evn = require("dotenv").config();
const db = require("./config/db")
db()
app.set

const PORT = process.env.PORT || 3000; // Change to any available port
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;


console.log('Name')