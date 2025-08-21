const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');

const router = express.Router();
router.use(cors());
router.use(express.json());

const otpStore = new Map();

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