const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const router = express.Router();
router.use(cors());
router.use(express.json());

router.post('/', async (req, res) => {
  const { toEmail, subject, text } = req.body;
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
      subject: subject,
      html: text
    });

    res.json({ success: true, message: 'Notification sent successfully'});
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

module.exports = router;
