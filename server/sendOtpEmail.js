const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const router = express.Router();
router.use(cors());
router.use(express.json());

router.post('/', async (req, res) => {
  const { toEmail, otpCode } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'stephenlwlhotmailcom@gmail.com',
        pass: 'eiau bqdb wkgj qbfl'
      }
    });

    await transporter.sendMail({
      from: '"AutoMate Verification" <stephenlwlhotmailcom@gmail.com>',
      to: toEmail,
      subject: 'Your AutoMate Verification OTP',
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ccc;">
          <h2 style="color: #FF6B00;">AutoMate Verification ${otpCode}</h2>
          <p>Thank you for registering. Use this OTP to verify your email:</p>
          <div style="font-size: 24px; font-weight: bold;">${otpCode}</div>
          <p>This code will expire in 1 minute.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'OTP sent successfully'});
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

module.exports = router;