import express from "express";
import sanitizeHtml from "sanitize-html";

const createEmailRouter = (resend, redis) => {
  const router = express.Router();

  const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 600; // 10 minutes
  const COOLDOWN_SECONDS = Number(process.env.OTP_COOLDOWN_SECONDS) || 60; // 60s
  const MAX_VERIFY_ATTEMPTS = Number(process.env.MAX_VERIFY_ATTEMPTS) || 5;
  const RESEND_OTP_FROM = process.env.FROM_VERIFY || "verify@mail.sakhiledumisa.com";

  const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
  // Simple HTML escape to safely embed user-provided text into templates
  const escapeHtml = (unsafe = '') =>
    String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  // Convert a name like "tina angel" or "TINA angel" into "Tina Angel"
  const titleCase = (input = '') => {
    return String(input)
      .trim()
      .split(/\s+/)
      .map(word => {
        // keep single-letter words uppercase (e.g., 'a', 'i') and preserve common hyphenated parts
        return word
          .split(/-/g)
          .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
          .join('-');
      })
      .join(' ');
  };


  
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
  const titledUserName = titleCase(cleanUserName);
  const cleanMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} }).trim();
  const cleanSentBy = sanitizeHtml(sentBy, { allowedTags: [], allowedAttributes: {} }).trim();

  // escape for safe HTML embedding
  const escapedUserName = escapeHtml(titledUserName);
  const escapedSentBy = escapeHtml(cleanSentBy);

  const subject = `New contact form message from ${titledUserName}`;
  const textBody = `You have received a new message via the contact form from ${titledUserName} <${sentBy}>:\n\n${cleanMessage}\n\nReply to: ${sentBy}`;

      // Build a simple HTML email (sanitize and preserve line breaks)
      const htmlMessage = escapeHtml(cleanMessage).replace(/\r\n|\r|\n/g, '<br>');

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
.t31,.t36{mso-line-height-alt:0px!important;line-height:0!important;display:none!important}.t32{padding-top:43px!important;border:0!important;border-radius:0!important}.t20{mso-line-height-alt:36px!important;line-height:36px!important}
}
</style>
<!--[if !mso]>-->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Albert+Sans:wght@500&amp;display=swap" rel="stylesheet" type="text/css" />
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
<body id="body" class="t39" style="min-width:100%;Margin:0px;padding:0px;background-color:#FFFFFF;"><div class="t38" style="background-color:#FFFFFF;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td class="t37" style="font-size:0;line-height:0;mso-line-height-rule:exactly;background-color:#FFFFFF;background-image:none;background-repeat:repeat;background-size:auto;background-position:center top;" valign="top" align="center">
<!--[if mso]>
<v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false">
<v:fill color="#FFFFFF"/>
</v:background>
<![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" id="innerTable"><tr><td><div class="t31" style="mso-line-height-rule:exactly;mso-line-height-alt:70px;line-height:70px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t35" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="400" class="t34" style="width:400px;">
<table class="t33" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t32" style="border:1px solid #CECECE;overflow:hidden;background-color:#FFFFFF;padding:50px 40px 40px 40px;border-radius:20px 20px 20px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100% !important;"><tr><td><div class="t1" style="mso-line-height-rule:exactly;mso-line-height-alt:10px;line-height:10px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t5" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="30" class="t4" style="width:30px;">
<table class="t3" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t2"><a href="#" style="font-size:0px;" target="_blank"><img class="t0" style="display:block;border:0;height:auto;width:100%;Margin:0;max-width:100%;" width="30" height="30" alt="" src="https://www.sakhiledumisa.com/favicon.ico"/></a></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t6" style="mso-line-height-rule:exactly;mso-line-height-alt:40px;line-height:40px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td><div class="t8" style="mso-line-height-rule:exactly;mso-line-height-alt:10px;line-height:10px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t12" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="318" class="t11" style="width:339px;">
<table class="t10" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t9"><h1 class="t7" style="margin:0;Margin:0;font-family:Inter,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:28px;font-weight:600;font-style:normal;font-size:24px;text-decoration:none;text-transform:none;letter-spacing:-1.2px;direction:ltr;color:#111111;text-align:center;mso-line-height-rule:exactly;mso-text-raise:1px;">Message from ${escapedUserName}</h1></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t14" style="mso-line-height-rule:exactly;mso-line-height-alt:27px;line-height:27px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t18" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="308" class="t17" style="width:308px;">
<table class="t16" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t15"><p class="t13" style="margin:0;Margin:0;font-family:Inter,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:22px;font-weight:500;font-style:normal;font-size:15px;text-decoration:none;text-transform:none;letter-spacing:-0.6px;direction:ltr;color:#424040;text-align:center;mso-line-height-rule:exactly;mso-text-raise:2px;">You have received a new form submission</p></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t20" style="mso-line-height-rule:exactly;mso-line-height-alt:40px;line-height:40px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t24" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="318" class="t23" style="width:420px;">
<table class="t22" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t21" style="overflow:hidden;background-color:#F2EFF3;padding:20px 30px 20px 30px;border-radius:8px 8px 8px 8px;"><p class="t19" style="margin:0;Margin:0;font-family:Albert Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:18px;font-weight:500;font-style:normal;font-size:12px;text-decoration:none;text-transform:none;direction:ltr;color:#84828E;text-align:center;mso-line-height-rule:exactly;mso-text-raise:2px;">${htmlMessage}</p></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t26" style="mso-line-height-rule:exactly;mso-line-height-alt:50px;line-height:50px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t30" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="154" class="t29" style="width:154px;">
<table class="t28" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t27" style="overflow:hidden;background-color:#111111;text-align:center;line-height:40px;mso-line-height-rule:exactly;mso-text-raise:8px;border-radius:8px 8px 8px 8px;"><a class="t25" href='mailto:${escapedSentBy}' style="display:block;margin:0;Margin:0;font-family:Inter,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:40px;font-weight:400;font-style:normal;font-size:15px;text-decoration:none;letter-spacing:-0.5px;direction:ltr;color:#FFFFFF;text-align:center;mso-line-height-rule:exactly;mso-text-raise:8px;" target="_blank">Email Back</a></td></tr></table>
</td></tr></table>
</td></tr></table></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t36" style="mso-line-height-rule:exactly;mso-line-height-alt:70px;line-height:70px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr></table></td></tr></table></div><div class="gmail-fix" style="display: none; white-space: nowrap; font: 15px courier; line-height: 0;">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div></body>
</html>`;

      // Send HTML + plain-text email using Resend and set reply_to to the user's email
      const data = await resend.emails.send({
        from,
        to,
        subject,
        text: textBody,
        html,
        reply_to: sentBy,
      });

      // After successfully sending the contact email, send a thank-you email to the user
      const thankFrom = process.env.FROM_CONTACT || from;
  const thankSubject = `Thanks for your message, ${titledUserName}`;
  const thankText = `Hi ${titledUserName},\n\nThanks for reaching out — we've received your message and will get back to you shortly.\n\nReply to: ${to}`;
      const thankHtml = `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#ffffff;color:#FFFFFF;font-family:"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#ffffff"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 24px 24px;text-align:center">
                <a
                  href="https://www.sakhiledumisa.com/"
                  style="text-decoration:none"
                  target="_blank"
                  ><img
                    alt=""
                    src="https://www.sakhiledumisa.com/favicon.ico"
                    height="24"
                    style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                /></a>
              </div>
              <div
                style='color:#000000;font-size:16px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Confirmation of Email Receipt.
              </div>
              <h3
                style='color:#000000;font-weight:bold;text-align:center;margin:0;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-size:20px;padding:16px 24px 16px 24px'
              >
                Thank you for your email, ${escapedUserName}. I will get back to
                you as soon as I can.
              </h3>
              <div
                style='color:#868686;font-size:16px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Please do not reply to this email; it is automated.
              </div>
              <div
                style='color:#868686;font-size:14px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Click the lime/green logo at the top to visit again. Thank you.
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`;

      let thankYouResult = null;
      try {
        thankYouResult = await resend.emails.send({
          from: thankFrom,
          to: sentBy,
          subject: thankSubject,
          text: thankText,
          html: thankHtml,
        });
      } catch (err) {
        console.error('Error sending thank-you email:', err.message || err);
        // don't fail the main request if thank-you fails; include the error in the response
        return res.status(200).json({ message: 'Email sent successfully', data, thankYouError: err.message || String(err) });
      }

      res.status(200).json({ message: "Email sent successfully", data, thankYou: thankYouResult });
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
        

        const data = await resend.emails.send({
          from: RESEND_OTP_FROM,
          to: email,
          subject: "Email verification code",
          text,
          html : `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#ffffff;color:#FFFFFF;font-family:"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#ffffff"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 24px 24px;text-align:center">
                <a
                  href="https://www.sakhiledumisa.com/"
                  style="text-decoration:none"
                  target="_blank"
                  ><img
                    alt=""
                    src="https://www.sakhiledumisa.com/favicon.ico"
                    height="24"
                    style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                /></a>
              </div>
              <div
                style='color:#000000;font-size:16px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Here is your one-time passcode:
              </div>
              <h1
                style='color:#000000;font-weight:bold;text-align:center;margin:0;font-family:"Nimbus Mono PS", "Courier New", "Cutive Mono", monospace;font-size:32px;padding:16px 24px 16px 24px'
              >
                ${code}
              </h1>
              <div
                style='color:#868686;font-size:16px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                This code will expire in ${Math.floor(OTP_TTL_SECONDS / 60)}
                minutes.
              </div>
              <div
                style='color:#868686;font-size:14px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                If you did not initiate this activity, please ignore this email.
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`});
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

      const text = `Email verification code is: ${code}\n\nThis code expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.`;
      const html = `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#ffffff;color:#FFFFFF;font-family:"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#ffffff"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 24px 24px;text-align:center">
                <a
                  href="https://www.sakhiledumisa.com/"
                  style="text-decoration:none"
                  target="_blank"
                  ><img
                    alt=""
                    src="https://www.sakhiledumisa.com/favicon.ico"
                    height="24"
                    style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                /></a>
              </div>
              <div
                style='color:#000000;font-size:16px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Here is your one-time passcode:
              </div>
              <h1
                style='color:#000000;font-weight:bold;text-align:center;margin:0;font-family:"Nimbus Mono PS", "Courier New", "Cutive Mono", monospace;font-size:32px;padding:16px 24px 16px 24px'
              >
                ${code}
              </h1>
              <div
                style='color:#868686;font-size:16px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                This code will expire in ${Math.floor(OTP_TTL_SECONDS / 60)}
                minutes.
              </div>
              <div
                style='color:#868686;font-size:14px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                If you did not initiate this activity, please ignore this email.
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`;
      const data = await resend.emails.send({ from: RESEND_OTP_FROM, to: email, subject: "Email verification code", text, html });

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