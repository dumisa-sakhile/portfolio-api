import express from "express";
import sanitizeHtml from "sanitize-html";

const createEmailRouter = (resend, redis) => {
  const router = express.Router();

  const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 600; // 10 minutes
  const COOLDOWN_SECONDS = Number(process.env.OTP_COOLDOWN_SECONDS) || 60; // 60s
  const MAX_VERIFY_ATTEMPTS = Number(process.env.MAX_VERIFY_ATTEMPTS) || 5;
  const RESEND_OTP_FROM = process.env.FROM_VERIFY || "verify@mail.sakhiledumisa.com";

  const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();


  // Welcome email endpoint
  router.post("/api/send-email", async (req, res) => {
    try {
      const { to, userName, sentBy, message, from = "form@mail.sakhiledumisa.com" } = req.body;

      // Input validation
      if (!to || !userName || !sentBy || !message) {
        return res.status(400).json({ error: "Missing required fields: to, userName, sentBy, and message" });
      }

      // Validate email formats
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        return res.status(400).json({ error: "Invalid recipient (to) email format" });
      }
      if (!emailRegex.test(sentBy)) {
        return res.status(400).json({ error: "Invalid sender (sentBy) email format" });
      }

      // Validate from address (Resend only allows your verified from address)
      if (from !== "form@mail.sakhiledumisa.com") {
        return res.status(400).json({ error: "Invalid from address" });
      }

      // Ensure sentBy (user email) has been verified via OTP before sending contact email


      if (!resend) {
        throw new Error("Resend client not initialized");
      }

      // If redis client wasn't injected, warn and proceed with in-memory verification fallback
      if (!redis) {
        console.warn('Redis client not provided — verification checks will be skipped (insecure).');
      } else {
        const verifiedKey = `verified:${sentBy}`;
        const isVerified = await redis.get(verifiedKey);
        if (!isVerified) {
          return res.status(403).json({ error: "Sender email not verified. Please verify via OTP before sending messages." });
        }
      }

      // Sanitize inputs for safety (message should be plain text)
      const cleanUserName = sanitizeHtml(userName, { allowedTags: [], allowedAttributes: {} }).trim();
      const cleanMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} }).trim();

      const subject = `New contact form message from ${cleanUserName}`;
      const textBody = `You have received a new message via the contact form from ${cleanUserName} <${sentBy}>:\n\n${cleanMessage}\n\nReply to: ${sentBy}`;

      // Send plain-text email using Resend and set reply_to to the user's email
      const data = await resend.emails.send({
        from,
        to,
        subject,
        text: textBody,
        reply_to: sentBy,
      });

      res.status(200).json({ message: "Email sent successfully", data });
    } catch (error) {
      console.error("Error sending email:", error.message);
      res
        .status(error.statusCode || 500)
        .json({ error: error.message || "Something went wrong!" });
    }
  });

  // Send OTP to an email for verification
  router.post("/api/send-otp", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Missing email" });

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });

      if (!resend) throw new Error("Resend client not initialized");

      // If no redis, fallback to a temporary in-memory cooldown (not recommended)
      if (!redis) {
        // generate and send without storing verification state
        const code = generateOtp();
        const text = `Your verification code is: ${code}\n\nThis code expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.`;
        const html = `
          <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<title></title>
<meta charset="UTF-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<!--[if !mso]>-->
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<!--<![endif]-->
<meta name="x-apple-disable-message-reformatting" content="" />
<meta content="target-densitydpi=device-dpi" name="viewport" />
<meta content="true" name="HandheldFriendly" />
<meta content="width=device-width" name="viewport" />
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
<style type="text/css">
table {
border-collapse: separate;
table-layout: fixed;
mso-table-lspace: 0pt;
mso-table-rspace: 0pt
}
table td {
border-collapse: collapse
}
.ExternalClass {
width: 100%
}
.ExternalClass,
.ExternalClass p,
.ExternalClass span,
.ExternalClass font,
.ExternalClass td,
.ExternalClass div {
line-height: 100%
}
body, a, li, p, h1, h2, h3 {
-ms-text-size-adjust: 100%;
-webkit-text-size-adjust: 100%;
}
html {
-webkit-text-size-adjust: none !important
}
body {
min-width: 100%;
Margin: 0px;
padding: 0px;
}
body, #innerTable {
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale
}
#innerTable img+div {
display: none;
display: none !important
}
img {
Margin: 0;
padding: 0;
-ms-interpolation-mode: bicubic
}
h1, h2, h3, p, a {
line-height: inherit;
overflow-wrap: normal;
white-space: normal;
word-break: break-word
}
a {
text-decoration: none
}
h1, h2, h3, p {
min-width: 100%!important;
width: 100%!important;
max-width: 100%!important;
display: inline-block!important;
border: 0;
padding: 0;
margin: 0
}
a[x-apple-data-detectors] {
color: inherit !important;
text-decoration: none !important;
font-size: inherit !important;
font-family: inherit !important;
font-weight: inherit !important;
line-height: inherit !important
}
u + #body a {
color: inherit;
text-decoration: none;
font-size: inherit;
font-family: inherit;
font-weight: inherit;
line-height: inherit;
}
a[href^="mailto"],
a[href^="tel"],
a[href^="sms"] {
color: inherit;
text-decoration: none
}
</style>
<style type="text/css">
@media (min-width: 481px) {
.hd { display: none!important }
}
</style>
<style type="text/css">
@media (max-width: 480px) {
.hm { display: none!important }
}
</style>
<style type="text/css">
@media (max-width: 480px) {
.t28,.t52{text-align:left!important}.t27,.t51{vertical-align:top!important;width:600px!important}.t7{font-size:12px!important;mso-text-raise:5px!important}
}
</style>
<!--[if !mso]>-->
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;700&amp;display=swap" rel="stylesheet" type="text/css" />
<!--<![endif]-->
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
</head>
<body id="body" class="t62" style="min-width:100%;Margin:0px;padding:0px;background-color:#F0F0F0;"><div class="t61" style="background-color:#F0F0F0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td class="t60" style="font-size:0;line-height:0;mso-line-height-rule:exactly;background-color:#F0F0F0;" valign="top" align="center">
<!--[if mso]>
<v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false">
<v:fill color="#F0F0F0"/>
</v:background>
<![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" id="innerTable"><tr><td align="center">
<table class="t35" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="600" class="t34" style="width:600px;">
<table class="t33" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t32" style="background-color:#FFFFFF;"><div class="t31" style="width:100%;text-align:left;"><div class="t30" style="display:inline-block;"><table class="t29" role="presentation" cellpadding="0" cellspacing="0" align="left" valign="top">
<tr class="t28"><td></td><td class="t27" width="600" valign="top">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="t26" style="width:100%;"><tr><td class="t25" style="background-color:transparent;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100% !important;"><tr><td><div class="t1" style="mso-line-height-rule:exactly;mso-line-height-alt:55px;line-height:55px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t5" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="315" class="t4" style="width:315px;">
<table class="t3" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t2"><h1 class="t0" style="margin:0;Margin:0;font-family:Fira Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:52px;font-weight:700;font-style:normal;font-size:48px;text-decoration:none;text-transform:none;direction:ltr;color:#000000;text-align:center;mso-line-height-rule:exactly;mso-text-raise:1px;">Verify Your Email</h1></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t6" style="mso-line-height-rule:exactly;mso-line-height-alt:30px;line-height:30px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t11" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="350" class="t10" style="width:350px;">
<table class="t9" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t8"><p class="t7" style="margin:0;Margin:0;font-family:Fira Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:30px;font-weight:500;font-style:normal;font-size:20px;text-decoration:none;text-transform:none;direction:ltr;color:#666666;text-align:center;mso-line-height-rule:exactly;mso-text-raise:3px;">Here&#39;s the OTP code you can use to verify your email address before being able to send your emails</p></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t13" style="mso-line-height-rule:exactly;mso-line-height-alt:40px;line-height:40px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t17" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="308" class="t16" style="width:308px;">
<table class="t15" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t14" style="overflow:hidden;background-color:#7BD415;text-align:center;line-height:58px;mso-line-height-rule:exactly;mso-text-raise:11px;border-radius:14px 14px 14px 14px;"><span class="t12" style="display:block;margin:0;Margin:0;font-family:Fira Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:58px;font-weight:700;font-style:normal;font-size:21px;text-decoration:none;direction:ltr;color:#FFFFFF;text-align:center;mso-line-height-rule:exactly;mso-text-raise:11px;">${code}</span></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t18" style="mso-line-height-rule:exactly;mso-line-height-alt:60px;line-height:60px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t23" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="350" class="t22" style="width:350px;">
<table class="t21" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t20"><p class="t19" style="margin:0;Margin:0;font-family:Fira Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:25px;font-weight:400;font-style:normal;font-size:16px;text-decoration:none;text-transform:none;direction:ltr;color:#BBBBBB;text-align:center;mso-line-height-rule:exactly;mso-text-raise:3px;">kindly not that this code expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.</p></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t24" style="mso-line-height-rule:exactly;mso-line-height-alt:125px;line-height:125px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr></table></td></tr></table>
</td>
<td></td></tr>
</table></div></div></td></tr></table>
</td></tr></table>
</td></tr><tr><td align="center">
<table class="t59" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="600" class="t58" style="width:600px;">
<table class="t57" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t56" style="background-color:transparent;"><div class="t55" style="width:100%;text-align:left;"><div class="t54" style="display:inline-block;"><table class="t53" role="presentation" cellpadding="0" cellspacing="0" align="left" valign="top">
<tr class="t52"><td></td><td class="t51" width="600" valign="top">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="t50" style="width:100%;"><tr><td class="t49" style="background-color:transparent;padding:40px 0 40px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100% !important;"><tr><td align="center">
<table class="t42" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="350" class="t41" style="width:350px;">
<table class="t40" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t39"><p class="t38" style="margin:0;Margin:0;font-family:Fira Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:19px;font-weight:400;font-style:normal;font-size:12px;text-decoration:none;text-transform:none;direction:ltr;color:#BBBBBB;text-align:center;mso-line-height-rule:exactly;mso-text-raise:2px;">If you did not send any email from my <a class="t37" href="https://www.sakhiledumisa.com/" style="margin:0;Margin:0;font-weight:700;font-style:normal;text-decoration:none;direction:ltr;color:#0000FF;mso-line-height-rule:exactly;" target="_blank"><span class="t36" style="margin:0;Margin:0;color:#7BD415;mso-line-height-rule:exactly;">portfolio</span></a>, please ignore this email.</p></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t43" style="mso-line-height-rule:exactly;mso-line-height-alt:20px;line-height:20px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t48" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="350" class="t47" style="width:350px;">
<table class="t46" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t45"><p class="t44" style="margin:0;Margin:0;font-family:Fira Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:19px;font-weight:400;font-style:normal;font-size:12px;text-decoration:none;text-transform:none;direction:ltr;color:#BBBBBB;text-align:center;mso-line-height-rule:exactly;mso-text-raise:2px;">Sakhile Dumisa ${new Date().getFullYear()} All rights reserved</p></td></tr></table>
</td></tr></table>
</td></tr></table></td></tr></table>
</td>
<td></td></tr>
</table></div></div></td></tr></table>
</td></tr></table>
</td></tr></table></td></tr></table></div><div class="gmail-fix" style="display: none; white-space: nowrap; font: 15px courier; line-height: 0;">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div></body>
</html>`;

        const data = await resend.emails.send({ from: RESEND_OTP_FROM, to: email, subject: "Your verification code", text, html });
        return res.status(200).json({ message: "OTP sent (no redis)", data, code });
      }

      const cooldownKey = `otp-cooldown:${email}`;
      const cooldownSet = await redis.set(cooldownKey, '1', { NX: true, EX: COOLDOWN_SECONDS });
      if (!cooldownSet) {
        return res.status(429).json({ error: `Please wait before requesting another code.` });
      }

      const code = generateOtp();
      const otpKey = `otp:${email}`;
      await redis.set(otpKey, code, { EX: OTP_TTL_SECONDS });
      // reset attempt counter
      const attemptsKey = `otp-attempts:${email}`;
      await redis.del(attemptsKey);

      const text = `Your verification code is: ${code}\n\nThis code expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.`;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">
          <h2 style="color:#2b6cb0">Your verification code</h2>
          <p>Use the code below to verify your email address. It expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.</p>
          <div style="margin:20px 0;padding:16px;background:#f4f6fb;border-radius:8px;display:inline-block;">
            <strong style="font-size:20px;letter-spacing:2px;color:#111">${code}</strong>
          </div>
          <p style="color:#666;margin-top:12px">If you did not request this, you can safely ignore this email.</p>
        </div>`;
      const data = await resend.emails.send({ from: RESEND_OTP_FROM, to: email, subject: "Your verification code", text, html });

      res.status(200).json({ message: "OTP sent", data });
    } catch (error) {
      console.error("Error sending OTP:", error.message);
      res.status(error.statusCode || 500).json({ error: error.message || "Something went wrong sending OTP" });
    }
  });

  // Verify an OTP for an email
  router.post("/api/verify-otp", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: "Missing email or code" });

      if (!redis) {
        return res.status(500).json({ error: "Redis not configured for verification" });
      }

      const otpKey = `otp:${email}`;
      const stored = await redis.get(otpKey);
      if (!stored) return res.status(400).json({ error: "No OTP requested or it expired" });

      const attemptsKey = `otp-attempts:${email}`;
      const attempts = await redis.incr(attemptsKey);
      if (attempts === 1) {
        await redis.expire(attemptsKey, OTP_TTL_SECONDS);
      }
      if (attempts > MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({ error: "Too many attempts, please request a new code." });
      }

      if (stored !== String(code).trim()) {
        return res.status(400).json({ error: "Invalid OTP" });
      }

      // success: mark verified and cleanup
      await redis.del(otpKey);
      await redis.del(attemptsKey);
      await redis.set(`verified:${email}`, '1');

      res.status(200).json({ message: "Email verified" });
    } catch (error) {
      console.error("Error verifying OTP:", error.message);
      res.status(500).json({ error: "Something went wrong verifying OTP" });
    }
  });

  return router;
};

export default createEmailRouter;