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
  const cleanSentBy = sanitizeHtml(sentBy, { allowedTags: [], allowedAttributes: {} }).trim();

  // escape for safe HTML embedding
  const escapedUserName = escapeHtml(cleanUserName);
  const escapedSentBy = escapeHtml(cleanSentBy);

      const subject = `New contact form message from ${cleanUserName}`;
      const textBody = `You have received a new message via the contact form from ${cleanUserName} <${sentBy}>:\n\n${cleanMessage}\n\nReply to: ${sentBy}`;

      // Build a simple HTML email (sanitize and preserve line breaks)
      const htmlMessage = escapeHtml(cleanMessage).replace(/\r\n|\r|\n/g, '<br>');

      const html = `
        <!doctype html>
<html>
  <body>
    <div
      style='background-color:#F2F5F7;color:#242424;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#FFFFFF;border-radius:12px"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 8px 24px;text-align:left">
                <img
                  alt=""
                  src="https://www.sakhiledumisa.com/favicon.ico"
                  height="24"
                  style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                />
              </div>
              <h3
                style='font-weight:bold;text-align:left;margin:0;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-size:20px;padding:32px 24px 0px 24px'
              >
                ${escapedUserName}
              </h3>
              <div
                style='color:#474849;font-size:14px;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-weight:normal;text-align:left;padding:8px 24px 16px 24px'
              >
                ${htmlMessage}
              </div>
              <div style="padding:16px 24px 16px 24px">
                <hr
                  style="width:100%;border:none;border-top:1px solid #EEEEEE;margin:0"
                />
              </div>
              <div
                style="color:#474849;font-size:12px;font-weight:normal;text-align:left;padding:4px 24px 24px 24px"
              >
                ${escapedSentBy} has emailed you.
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
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
      const thankSubject = `Thanks for your message, ${cleanUserName}`;
      const thankText = `Hi ${cleanUserName},\n\nThanks for reaching out — we've received your message and will get back to you shortly.\n\nReply to: ${to}`;
      const currentYear = new Date().getFullYear();
      const thankHtml = `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#F2F5F7;color:#242424;font-family:Optima, Candara, "Noto Sans", source-sans-pro, sans-serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#FFFFFF;border-radius:8px"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 8px 24px;text-align:left">
                <img
                  alt=""
                  src="https://www.sakhiledumisa.com/favicon.ico"
                  height="24"
                  style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                />
              </div>
              <h3
                style='font-weight:bold;text-align:left;margin:0;font-family:Optima, Candara, "Noto Sans", source-sans-pro, sans-serif;font-size:20px;padding:32px 24px 0px 24px'
              >
                Email Received
              </h3>
              <div
                style='color:#474849;font-size:17px;font-family:Optima, Candara, "Noto Sans", source-sans-pro, sans-serif;font-weight:normal;text-align:left;padding:8px 24px 16px 24px'
              >
                Dear ${escapedUserName},
              </div>
              <div
                style='font-family:Optima, Candara, "Noto Sans", source-sans-pro, sans-serif;font-weight:normal;padding:16px 24px 16px 24px'
              >
                Thank you for your email, I will respond as soon as I can.
              </div>
              <div style="text-align:left;padding:12px 24px 32px 24px">
                <a
                  href="https://www.sakhiledumisa.com/"
                  style='color:#FFFFFF;font-size:14px;font-family:Optima, Candara, "Noto Sans", source-sans-pro, sans-serif;font-weight:bold;background-color:#7ed307;display:inline-block;padding:12px 20px;text-decoration:none'
                  target="_blank"
                  ><span
                    ><!--[if mso
                      ]><i
                        style="letter-spacing: 20px;mso-font-width:-100%;mso-text-raise:30"
                        hidden
                        >&nbsp;</i
                      ><!
                    [endif]--></span
                  ><span>Visit My Portfolio Again</span
                  ><span
                    ><!--[if mso
                      ]><i
                        style="letter-spacing: 20px;mso-font-width:-100%"
                        hidden
                        >&nbsp;</i
                      ><!
                    [endif]--></span
                  ></a
                >
              </div>
              <div style="padding:16px 24px 16px 24px">
                <hr
                  style="width:100%;border:none;border-top:1px solid #EEEEEE;margin:0"
                />
              </div>
              <div
                style='color:#474849;font-size:12px;font-family:Optima, Candara, "Noto Sans", source-sans-pro, sans-serif;font-weight:normal;text-align:left;padding:4px 24px 24px 24px'
              >
                Sakhile Dumisa ${currentYear}. All rights reserved.
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
          subject: "Your verification code",
          text,
          html : `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#FAFAFA;color:#FFFFFF;font-family:"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#FAFAFA;border-radius:12px"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 24px 24px;text-align:center">
                <img
                  alt=""
                  src="https://www.sakhiledumisa.com/favicon.ico"
                  height="24"
                  style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                />
              </div>
              <div
                style='color:#000000;font-size:16px;font-family:Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Here is your one-time passcode:
              </div>
              <h1
                style='color:#000000;font-weight:bold;text-align:center;margin:0;font-family:"Nimbus Mono PS", "Courier New", "Cutive Mono", monospace;font-size:32px;padding:16px 24px 16px 24px'
              >
                ${code}
              </h1>
              <div
                style='color:#868686;font-size:16px;font-family:Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                This code will expire in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.
              </div>
              <div
                style='color:#000000;font-size:14px;font-family:Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Problems? Email hello@sakhiledumisa.com. If you did not initiate
                this activity, please ignore this email.
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

      const text = `Your verification code is: ${code}\n\nThis code expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.`;
      const html = `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#FAFAFA;color:#FFFFFF;font-family:"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#FAFAFA;border-radius:12px"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 24px 24px;text-align:center">
                <img
                  alt=""
                  src="https://www.sakhiledumisa.com/favicon.ico"
                  height="24"
                  style="height:24px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                />
              </div>
              <div
                style='color:#000000;font-size:16px;font-family:Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Here is your one-time passcode:
              </div>
              <h1
                style='color:#000000;font-weight:bold;text-align:center;margin:0;font-family:"Nimbus Mono PS", "Courier New", "Cutive Mono", monospace;font-size:32px;padding:16px 24px 16px 24px'
              >
                ${code}
              </h1>
              <div
                style='color:#868686;font-size:16px;font-family:Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                This code will expire in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes.
              </div>
              <div
                style='color:#000000;font-size:14px;font-family:Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif;font-weight:normal;text-align:center;padding:16px 24px 16px 24px'
              >
                Problems? Email hello@sakhiledumisa.com. If you did not initiate
                this activity, please ignore this email.
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`;
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