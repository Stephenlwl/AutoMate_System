const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
const path = require("path");

const router = express.Router();
router.use(cors());
router.use(express.json());

const otpStore = new Map();
const logoPath = path.join(__dirname, "../public/logo.png");

router.post('/send', async (req, res) => {
  const { toEmail } = req.body;

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpCodeHash = crypto.createHash('sha256').update(otpCode).digest('hex');

  otpStore.set(toEmail, { otpCode: otpCodeHash, expires: Date.now() + 60 * 1000 }); // exp in 1 min

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
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 500px; margin: auto; background: #fafafa;">
          
          <div style="text-align:center; margin-bottom:20px;">
            <img src="cid:logo" alt="AutoMate Logo" style="max-height:60px;">
          </div>

          <h2 style="color:#FF6B00; text-align:center; margin-bottom:20px;">AutoMate Email Verification</h2>

          <p style="font-size:14px; color:#333; text-align:center;">
            Thank you for registering with <b>AutoMate</b>. <br>
            Please use the following One-Time Password (OTP) to verify your email:
          </p>

          <!-- otp container -->
          <div style="font-size:28px; font-weight:bold; color:#222; background:#fff; border:1px dashed #FF6B00; padding:15px; text-align:center; margin:20px auto; width:200px; border-radius:6px;">
            ${otpCode}
          </div>

          <p style="font-size:13px; color:#666; text-align:center;">
            This code will expire in <b>1 minute</b>. <br>
            If you did not request this, please ignore this email.
          </p>

          <hr style="margin:30px 0; border:none; border-top:1px solid #eee;">
          <p style="font-size:12px; color:#999; text-align:center;">
            © ${new Date().getFullYear()} AutoMate. All rights reserved.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: "logo.png",
          path: logoPath,
          cid: "logo" // ensure the logo is embedded in the email especially for gmail
        }
      ]
    });

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

router.post('/verify', (req, res) => {
  const { toEmail, otpInput } = req.body;
  const record = otpStore.get(toEmail);

  if (!record) {
    return res.status(400).json({ success: false, message: 'No OTP found. Request a new otp code.' });
  }

  if (Date.now() > record.expires) {
    otpStore.delete(toEmail);
    return res.status(400).json({ success: false, message: 'OTP expired. Please request again.' });
  }

  const hash = crypto.createHash('sha256').update(otpInput).digest('hex');
  if (hash !== record.otpCode) {
    record.otpCode = null;
    return res.status(400).json({ success: false, message: 'Invalid OTP! Please request a new OTP code.' });
  }

  // remove otp code to prevent reuse
  otpStore.delete(toEmail);
  return res.json({ success: true, message: 'OTP verified successfully' });
});

module.exports = router;