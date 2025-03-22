const express = require("express")
const app = express()
const path = require("path")
const evn = require("dotenv").config();
const db = require("./config/db")
db()
const userRouter = require("./routes/userRouter")



app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.set("view engine","ejs")
app.set("views", [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.use(express.static(path.join(__dirname,"public")))


app.use("/",userRouter)

 // Change to any available port
app.listen(process.env.PORT, () => {
  console.log("Server running on port");
});

module.exports = app;

