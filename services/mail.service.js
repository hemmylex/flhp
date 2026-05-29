import transporter from "../config/mail.js";

export const sendVerificationEmail = async ({
  email,
  token,
  businessName,
}) => {
  const link = `${process.env.CLIENT_URL}/register/verify-email?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,

    to: email,

    subject: "Verify your FOLO Laundry Pro registration",

    html: `
      <div style="font-family:sans-serif;padding:20px;">
        
        <h2>Continue Registration</h2>

        <p>
          Hi ${businessName || "there"},
        </p>

        <p>
          Your FOLO Laundry Pro registration is still in progress.
        </p>

        <p>
          Click below to continue:
        </p>

        <a
          href="${link}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#16a34a;
            color:white;
            text-decoration:none;
            border-radius:8px;
          "
        >
          Resume Registration
        </a>
        <p>
          Or copy and paste this link in your browser:
        </p>
        <p style="font-size:12px;color:#555;">
          ${link}
        </p>
        <p style="margin-top:20px;">
          This link expires in 24 hours.
        </p>

      </div>
    `,
  });
};