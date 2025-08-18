const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

// import route handlers
const sendOtp = require("./sendOtpEmail");
const sendNotification = require("./sendNotification");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// the mailer routes
app.use("/sendOtpEmail", sendOtp);
app.use("/sendNotification", sendNotification);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
