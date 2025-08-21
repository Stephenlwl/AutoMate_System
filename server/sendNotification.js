const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require("path");

const router = express.Router();
router.use(cors());
router.use(express.json());

const logoPath = path.join(__dirname, "../public/logo.png");

router.post('/approve', async (req, res) => {
  const { toEmail } = req.body;
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
      subject: 'Service Center Application Approved',
      html: `
      <div style="font-family: Arial, sans-serif; font-size:14px; color:#333; line-height:1.6;">

        <div style="text-align:center; margin-bottom:20px;">
          <img src="cid:logo" alt="Company Logo" style="max-height:60px;">
        </div>

        <p>Dear,</p>

        <p>We are pleased to inform you that your service center account has been 
        <span style="color:#28a745; font-weight:bold;">verified successfully</span>.</p>

        <p>You may now log in and start managing your services through the system. 
        We’re excited to have you onboard and look forward to supporting your journey.</p>

        <p style="margin-top:20px;">Best regards,<br>
        <b>The Automate Repair Service Center Team</b></p>

        <!-- Footer -->
        <hr style="margin:30px 0; border:none; border-top:1px solid #eee;">
        <p style="font-size:12px; color:#999; text-align:center;">
          © ${new Date().getFullYear()} Automate Repair Service Center. All rights reserved.<br>
          This is an automated message, please do not reply directly to this email.
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

    res.json({ success: true, message: 'The approved notification sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

router.post('/reject', async (req, res) => {
  const { toEmail, rejectionReason } = req.body;
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
      subject: 'Service Center Application Rejected',
      html: `
        <div style="font-family: Arial, sans-serif; font-size:14px; color:#333; line-height:1.6;">

          <div style="text-align:center; margin-bottom:20px;">
            <img src="cid:logo" alt="Automate System Logo" style="max-height:60px;">
          </div>

          <p>Dear,</p>

          <p>Thank you for registering with <b>Automate Repair Service Center System</b>. 
          After careful review, we regret to inform you that your registration has been 
          <span style="color:#d9534f; font-weight:bold;">rejected</span> due to the following reason(s):</p>

          <blockquote style="border-left:4px solid #d9534f; margin:15px 0; padding:10px 15px; background:#f9f9f9; color:#555;">
            ${rejectionReason}
          </blockquote>

          <p>We encourage you to revise your application and resubmit it for consideration. 
          If you need clarification or assistance, feel free to contact our support team.</p>

          <p style="margin-top:20px;">Best regards,<br>
          <b>The Automate Repair Service Center System Team</b></p>

          <!-- Footer -->
          <hr style="margin:30px 0; border:none; border-top:1px solid #eee;">
          <p style="font-size:12px; color:#999; text-align:center;">
            © ${new Date().getFullYear()} Automate Repair Service Center System. All rights reserved.<br>
            This is an automated message, please do not reply directly to this email.
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

    res.json({ success: true, message: 'The rejection notification sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

module.exports = router;
