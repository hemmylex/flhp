import axios from "axios";

export const sendVerificationEmail = async ({ email, token, businessName }) => {
  const link = `${process.env.CLIENT_URL}/register/verify-email?token=${token}`;

  try {
    const response = await axios.post("https://api.brevo.com/v3/smtp/email", {
      sender: { name: "FOLO Laundry Pro", email: process.env.BREVO_USER },
      to: [{ email }],
      subject: "Verify your FOLO Laundry Pro registration",
      htmlContent: `
        <div style="font-family:sans-serif;padding:20px;">
          <h2>Continue Registration</h2>
          <p>Hi ${businessName || "there"},</p>
          <p>Your FOLO Laundry Pro registration is still in progress.</p>
          <p>Click below to continue:</p>
          <a href="${link}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:white;text-decoration:none;border-radius:8px;">
            Resume Registration
          </a>
          <p>Or copy and paste this link in your browser:</p>
          <p style="font-size:12px;color:#555;">${link}</p>
          <p style="margin-top:20px;">This link expires in 24 hours.</p>
        </div>
      `,
    }, {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log("Verification email sent:", response.data);
    return response.data;
  } catch (error) {
    console.error("Brevo API Error:", error.response?.data || error.message);
    return null;
  }
};

export const sendPasswordResetEmail = async ({ email, token, businessName }) => {
  const link = `${process.env.CLIENT_URL}/forget-password/reset-password?token=${token}`;

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email", 
      {
        sender: { name: "FOLO Laundry Pro", email: process.env.BREVO_USER },
        to: [{ email }],
        subject: "Reset your FOLO Laundry Pro password",
        htmlContent: `
          <div style="font-family:sans-serif;padding:20px;max-width:500px;margin:0 auto;border:1px solid #f0f0f0;border-radius:12px;">
            <h2 style="color:#111827;font-weight:800;margin-bottom:16px;">Password Reset Requested</h2>
            <p style="color:#4b5563;font-size:14px;line-height:1.5;">Hi ${businessName || "there"},</p>
            <p style="color:#4b5563;font-size:14px;line-height:1.5;">We received a request to change the password for your account. If you did not initiate this action, you can safely disregard this message.</p>
            <p style="color:#4b5563;font-size:14px;line-height:1.5;margin-bottom:24px;">Click the button below to configure a new account password selection securely:</p>
            
            <div style="text-align:center;margin-bottom:24px;">
              <a href="${link}" style="display:inline-block;padding:14px 24px;background:#16a34a;color:white;text-decoration:none;border-radius:10px;font-weight:bold;font-size:14px;box-shadow:0 2px 4px rgba(22,163,74,0.15);">
                Reset Account Password
              </a>
            </div>
            
            <p style="color:#4b5563;font-size:14px;line-height:1.5;">Or copy and paste this recovery reference path into your browser address bar:</p>
            <p style="font-size:12px;color:#059669;word-break:break-all;background:#f0fdf4;padding:10px;border-radius:6px;font-family:monospace;">${link}</p>
            
            <p style="margin-top:24px;font-size:12px;color:#9ca3af;border-t:1px solid #f3f4f6;pt:16px;">
              ⚠️ Safety notice: For security reasons, this recovery session token link will expire automatically in exactly 1 hour.
            </p>
          </div>
        `,
      }, 
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Password reset email sent:", response.data);
    return response.data;
  } catch (error) {
    console.error("Brevo Password Reset API Error:", error.response?.data || error.message);
    return null;
  }
};
