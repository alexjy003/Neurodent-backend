const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Check if we have email credentials configured
      if (process.env.EMAIL_USER &&
          process.env.EMAIL_PASS &&
          process.env.EMAIL_USER !== 'YOUR_SENDER_GMAIL@gmail.com' &&
          process.env.EMAIL_PASS !== 'YOUR_16_CHARACTER_APP_PASSWORD') {

        // Use real Gmail SMTP
        this.transporter = nodemailer.createTransport({
          service: process.env.EMAIL_SERVICE || 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        console.log('📧 Email service initialized with Gmail SMTP:', process.env.EMAIL_USER);

        // Test the connection
        try {
          await this.transporter.verify();
          console.log('✅ Gmail SMTP connection verified');
        } catch (verifyError) {
          console.error('❌ Gmail SMTP verification failed:', verifyError.message);
          console.log('💡 Check your Gmail credentials and App Password');
          throw verifyError;
        }

      } else {
        // Fallback to Ethereal Email for testing when no real credentials
        console.log('⚠️  Gmail credentials not configured, using Ethereal Email for testing');
        console.log('💡 To send real emails, configure Gmail App Password in .env file');

        const testAccount = await nodemailer.createTestAccount();

        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });

        console.log('📧 Email service initialized with test account:', testAccount.user);
        console.log('🔗 Email previews will be available at: https://ethereal.email');
      }
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error);
      console.log('💡 Falling back to test mode');

      // Fallback to test mode if Gmail fails
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        console.log('📧 Fallback: Using test email service');
      } catch (fallbackError) {
        console.error('❌ Even test email service failed:', fallbackError);
      }
    }
  }

  async sendPasswordResetEmail(email, resetToken, firstName) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_FROM || 'noreply@neurodent.com'}>`,
        to: email,
        subject: 'Password Reset Request - Neurodent Clinic',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset - Neurodent Clinic</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .button:hover { background: #5a6fd8; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🦷 Neurodent Clinic</h1>
                <h2>Password Reset Request</h2>
              </div>
              <div class="content">
                <p>Hello ${firstName},</p>
                
                <p>We received a request to reset your password for your Neurodent Clinic patient account.</p>
                
                <p>Click the button below to reset your password:</p>
                
                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Reset My Password</a>
                </div>
                
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">
                  ${resetUrl}
                </p>
                
                <div class="warning">
                  <strong>⚠️ Important:</strong>
                  <ul>
                    <li>This link will expire in <strong>10 minutes</strong></li>
                    <li>If you didn't request this reset, please ignore this email</li>
                    <li>Your password will remain unchanged until you create a new one</li>
                  </ul>
                </div>
                
                <p>If you're having trouble with the button above, copy and paste the URL into your web browser.</p>
                
                <p>Best regards,<br>
                The Neurodent Clinic Team</p>
              </div>
              <div class="footer">
                <p>This email was sent to ${email}</p>
                <p>© 2025 Neurodent Clinic. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Hello ${firstName},
          
          We received a request to reset your password for your Neurodent Clinic patient account.
          
          Please click the following link to reset your password:
          ${resetUrl}
          
          This link will expire in 10 minutes.
          
          If you didn't request this reset, please ignore this email.
          
          Best regards,
          The Neurodent Clinic Team
        `
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Check if this is a real email or test email
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'your-email@gmail.com';

      if (isRealEmail) {
        console.log('📧 Password reset email sent to:', email);
        console.log('✅ Message ID:', info.messageId);
      } else {
        console.log('📧 Password reset email sent (test mode)');
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };
      
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendEmailVerificationOTP(email, otp, firstName) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Email Verification Code - Neurodent Clinic',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background: white; padding: 30px; border-radius: 10px; text-align: center;">
              <h1 style="color: #667eea; margin-bottom: 20px;">Neurodent Clinic</h1>
              <h2 style="color: #333; margin-bottom: 30px;">Email Verification</h2>

              <p style="color: #666; font-size: 16px; margin-bottom: 30px;">
                Hello ${firstName || 'there'},<br><br>
                Your verification code is:
              </p>

              <div style="background: #667eea; color: white; padding: 20px; border-radius: 8px; margin: 30px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px;">
                ${otp}
              </div>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                This code expires in 10 minutes.<br>
                Enter this code on the registration page to verify your email.
              </p>

              <p style="color: #999; font-size: 12px; margin-top: 40px;">
                Neurodent Clinic - ${email}
              </p>
            </div>
          </div>
        `,
        text: `
Neurodent Clinic - Email Verification

Hello ${firstName || 'there'},

Your verification code is: ${otp}

This code expires in 10 minutes.
Enter this code on the registration page to verify your email.

Neurodent Clinic
        `
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Check if this is a real email or test email
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'YOUR_GMAIL_ADDRESS@gmail.com';

      if (isRealEmail) {
        console.log('📧 Email verification OTP sent to:', email);
        console.log('✅ Message ID:', info.messageId);
      } else {
        console.log('📧 Email verification OTP sent (test mode)');
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send email verification OTP:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendPasswordResetOTP(email, otp, firstName) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset Code - Neurodent Clinic',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background: white; padding: 30px; border-radius: 10px; text-align: center;">
              <h1 style="color: #667eea; margin-bottom: 20px;">Neurodent Clinic</h1>
              <h2 style="color: #333; margin-bottom: 30px;">Password Reset</h2>

              <p style="color: #666; font-size: 16px; margin-bottom: 30px;">
                Hello ${firstName || 'there'},<br><br>
                You requested to reset your password. Use the code below to reset your password:
              </p>

              <div style="background: #667eea; color: white; padding: 20px; border-radius: 8px; margin: 30px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px;">
                ${otp}
              </div>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                This code expires in 10 minutes.<br>
                If you didn't request a password reset, please ignore this email.
              </p>

              <p style="color: #999; font-size: 12px; margin-top: 40px;">
                Neurodent Clinic - ${email}
              </p>
            </div>
          </div>
        `,
        text: `
Neurodent Clinic - Password Reset

Hello ${firstName || 'there'},

You requested to reset your password. Use the code below to reset your password:

Password Reset Code: ${otp}

This code expires in 10 minutes.
If you didn't request a password reset, please ignore this email.

Neurodent Clinic
        `
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Check if this is a real email or test email
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'YOUR_GMAIL_ADDRESS@gmail.com';

      if (isRealEmail) {
        console.log('📧 Password reset OTP sent to:', email);
        console.log('✅ Message ID:', info.messageId);
      } else {
        console.log('📧 Password reset OTP sent (test mode)');
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send password reset OTP:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendPasswordResetConfirmation(email, firstName) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_FROM || 'noreply@neurodent.com'}>`,
        to: email,
        subject: 'Password Successfully Reset - Neurodent Clinic',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Confirmation - Neurodent Clinic</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #155724; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🦷 Neurodent Clinic</h1>
                <h2>✅ Password Reset Successful</h2>
              </div>
              <div class="content">
                <p>Hello ${firstName},</p>
                
                <div class="success">
                  <strong>✅ Success!</strong> Your password has been successfully reset.
                </div>
                
                <p>Your Neurodent Clinic account password has been updated. You can now log in with your new password.</p>
                
                <p>If you didn't make this change, please contact our support team immediately.</p>
                
                <p>Best regards,<br>
                The Neurodent Clinic Team</p>
              </div>
              <div class="footer">
                <p>This email was sent to ${email}</p>
                <p>© 2025 Neurodent Clinic. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Hello ${firstName},
          
          Your Neurodent Clinic account password has been successfully reset.
          
          You can now log in with your new password.
          
          If you didn't make this change, please contact our support team immediately.
          
          Best regards,
          The Neurodent Clinic Team
        `
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Check if this is a real email or test email
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'your-email@gmail.com';

      if (isRealEmail) {
        console.log('📧 Password reset confirmation email sent to:', email);
        console.log('✅ Message ID:', info.messageId);
      } else {
        console.log('📧 Password reset confirmation email sent (test mode)');
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };
      
    } catch (error) {
      console.error('❌ Failed to send password reset confirmation email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService();
