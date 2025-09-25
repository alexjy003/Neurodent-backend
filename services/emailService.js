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

  async sendAppointmentBookingConfirmation(appointmentData) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const {
        patientEmail,
        patientName,
        doctorName,
        specialization,
        appointmentDate,
        timeRange,
        slotType,
        symptoms
      } = appointmentData;

      const formattedDate = new Date(appointmentDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_FROM || 'noreply@neurodent.com'}>`,
        to: patientEmail,
        subject: 'Appointment Confirmation - Neurodent Clinic',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Appointment Confirmation - Neurodent Clinic</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .appointment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
              .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
              .detail-label { font-weight: bold; color: #666; }
              .detail-value { color: #333; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              .reminder { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #0c5460; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🦷 Neurodent Clinic</h1>
                <h2>✅ Appointment Confirmed</h2>
              </div>
              <div class="content">
                <p>Dear ${patientName},</p>
                
                <p>Your appointment has been successfully booked! Here are the details:</p>
                
                <div class="appointment-details">
                  <h3 style="margin-top: 0; color: #28a745;">📅 Appointment Details</h3>
                  
                  <div class="detail-row">
                    <span class="detail-label">👨‍⚕️ Doctor:</span>
                    <span class="detail-value">${doctorName}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🏥 Specialization:</span>
                    <span class="detail-value">${specialization}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">📅 Date:</span>
                    <span class="detail-value">${formattedDate}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🕐 Time:</span>
                    <span class="detail-value">${timeRange}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🏷️ Appointment Type:</span>
                    <span class="detail-value">${slotType}</span>
                  </div>
                  
                  ${symptoms ? `
                  <div class="detail-row">
                    <span class="detail-label">📝 Symptoms/Notes:</span>
                    <span class="detail-value">${symptoms}</span>
                  </div>
                  ` : ''}
                  
                  <div class="detail-row" style="border-bottom: none;">
                    <span class="detail-label">📍 Location:</span>
                    <span class="detail-value">Neurodent Clinic</span>
                  </div>
                </div>
                
                <div class="reminder">
                  <strong>💡 Important Reminders:</strong>
                  <ul>
                    <li>Please arrive 15 minutes before your appointment time</li>
                    <li>Bring a valid ID and any relevant medical records</li>
                    <li>You can cancel or reschedule up to 2 hours before your appointment</li>
                    <li>If you need to make changes, log into your patient dashboard</li>
                  </ul>
                </div>
                
                <p>We look forward to seeing you at Neurodent Clinic!</p>
                
                <p>Best regards,<br>
                The Neurodent Clinic Team</p>
              </div>
              <div class="footer">
                <p>This email was sent to ${patientEmail}</p>
                <p>© 2025 Neurodent Clinic. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Dear ${patientName},
          
          Your appointment has been successfully booked!
          
          APPOINTMENT DETAILS:
          Doctor: ${doctorName}
          Specialization: ${specialization}
          Date: ${formattedDate}
          Time: ${timeRange}
          Appointment Type: ${slotType}
          Location: Neurodent Clinic
          ${symptoms ? `Symptoms/Notes: ${symptoms}` : ''}
          
          IMPORTANT REMINDERS:
          - Please arrive 15 minutes before your appointment time
          - Bring a valid ID and any relevant medical records
          - You can cancel or reschedule up to 2 hours before your appointment
          - If you need to make changes, log into your patient dashboard
          
          We look forward to seeing you at Neurodent Clinic!
          
          Best regards,
          The Neurodent Clinic Team
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'YOUR_GMAIL_ADDRESS@gmail.com';

      console.log('📧 Appointment booking confirmation sent to:', patientEmail);

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send appointment booking confirmation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendAppointmentCancellationNotification(appointmentData) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const {
        patientEmail,
        patientName,
        doctorName,
        specialization,
        appointmentDate,
        timeRange,
        slotType,
        cancellationReason
      } = appointmentData;

      const formattedDate = new Date(appointmentDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_FROM || 'noreply@neurodent.com'}>`,
        to: patientEmail,
        subject: 'Appointment Cancelled - Neurodent Clinic',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Appointment Cancelled - Neurodent Clinic</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .appointment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545; }
              .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
              .detail-label { font-weight: bold; color: #666; }
              .detail-value { color: #333; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              .booking-info { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #155724; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🦷 Neurodent Clinic</h1>
                <h2>❌ Appointment Cancelled</h2>
              </div>
              <div class="content">
                <p>Dear ${patientName},</p>
                
                <p>Your appointment has been successfully cancelled as requested.</p>
                
                <div class="appointment-details">
                  <h3 style="margin-top: 0; color: #dc3545;">📅 Cancelled Appointment Details</h3>
                  
                  <div class="detail-row">
                    <span class="detail-label">👨‍⚕️ Doctor:</span>
                    <span class="detail-value">${doctorName}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🏥 Specialization:</span>
                    <span class="detail-value">${specialization}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">📅 Date:</span>
                    <span class="detail-value">${formattedDate}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🕐 Time:</span>
                    <span class="detail-value">${timeRange}</span>
                  </div>
                  
                  <div class="detail-row" style="border-bottom: none;">
                    <span class="detail-label">🏷️ Appointment Type:</span>
                    <span class="detail-value">${slotType}</span>
                  </div>
                </div>
                
                <div class="booking-info">
                  <strong>💡 Need to Book Another Appointment?</strong>
                  <p>You can easily book a new appointment by:</p>
                  <ul>
                    <li>Logging into your patient dashboard</li>
                    <li>Browsing available doctors and time slots</li>
                    <li>Calling our clinic directly</li>
                  </ul>
                </div>
                
                <p>If you have any questions or need assistance with booking a new appointment, please don't hesitate to contact us.</p>
                
                <p>Thank you for choosing Neurodent Clinic.</p>
                
                <p>Best regards,<br>
                The Neurodent Clinic Team</p>
              </div>
              <div class="footer">
                <p>This email was sent to ${patientEmail}</p>
                <p>© 2025 Neurodent Clinic. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Dear ${patientName},
          
          Your appointment has been successfully cancelled as requested.
          
          CANCELLED APPOINTMENT DETAILS:
          Doctor: ${doctorName}
          Specialization: ${specialization}
          Date: ${formattedDate}
          Time: ${timeRange}
          Appointment Type: ${slotType}
          
          NEED TO BOOK ANOTHER APPOINTMENT?
          You can easily book a new appointment by:
          - Logging into your patient dashboard
          - Browsing available doctors and time slots
          - Calling our clinic directly
          
          If you have any questions or need assistance with booking a new appointment, please don't hesitate to contact us.
          
          Thank you for choosing Neurodent Clinic.
          
          Best regards,
          The Neurodent Clinic Team
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'YOUR_GMAIL_ADDRESS@gmail.com';

      console.log('📧 Appointment cancellation notification sent to:', patientEmail);

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send appointment cancellation notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendAppointmentRescheduleNotification(appointmentData) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const {
        patientEmail,
        patientName,
        doctorName,
        specialization,
        oldDate,
        oldTimeRange,
        newDate,
        newTimeRange,
        slotType,
        symptoms
      } = appointmentData;

      const formattedOldDate = new Date(oldDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const formattedNewDate = new Date(newDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const mailOptions = {
        from: `"Neurodent Clinic" <${process.env.EMAIL_FROM || 'noreply@neurodent.com'}>`,
        to: patientEmail,
        subject: 'Appointment Rescheduled - Neurodent Clinic',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Appointment Rescheduled - Neurodent Clinic</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .appointment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #17a2b8; }
              .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
              .detail-label { font-weight: bold; color: #666; }
              .detail-value { color: #333; }
              .old-appointment { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 10px 0; }
              .new-appointment { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 10px 0; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              .reminder { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #0c5460; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🦷 Neurodent Clinic</h1>
                <h2>🔄 Appointment Rescheduled</h2>
              </div>
              <div class="content">
                <p>Dear ${patientName},</p>
                
                <p>Your appointment has been successfully rescheduled!</p>
                
                <div class="old-appointment">
                  <h4 style="margin-top: 0; color: #721c24;">❌ Previous Appointment (Cancelled)</h4>
                  <p><strong>Date:</strong> ${formattedOldDate}<br>
                  <strong>Time:</strong> ${oldTimeRange}</p>
                </div>
                
                <div class="new-appointment">
                  <h4 style="margin-top: 0; color: #155724;">✅ New Appointment (Confirmed)</h4>
                  <p><strong>Date:</strong> ${formattedNewDate}<br>
                  <strong>Time:</strong> ${newTimeRange}</p>
                </div>
                
                <div class="appointment-details">
                  <h3 style="margin-top: 0; color: #17a2b8;">📅 Complete Appointment Details</h3>
                  
                  <div class="detail-row">
                    <span class="detail-label">👨‍⚕️ Doctor:</span>
                    <span class="detail-value">${doctorName}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🏥 Specialization:</span>
                    <span class="detail-value">${specialization}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">📅 Date:</span>
                    <span class="detail-value">${formattedNewDate}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🕐 Time:</span>
                    <span class="detail-value">${newTimeRange}</span>
                  </div>
                  
                  <div class="detail-row">
                    <span class="detail-label">🏷️ Appointment Type:</span>
                    <span class="detail-value">${slotType}</span>
                  </div>
                  
                  ${symptoms ? `
                  <div class="detail-row">
                    <span class="detail-label">📝 Symptoms/Notes:</span>
                    <span class="detail-value">${symptoms}</span>
                  </div>
                  ` : ''}
                  
                  <div class="detail-row" style="border-bottom: none;">
                    <span class="detail-label">📍 Location:</span>
                    <span class="detail-value">Neurodent Clinic</span>
                  </div>
                </div>
                
                <div class="reminder">
                  <strong>💡 Important Reminders:</strong>
                  <ul>
                    <li>Please arrive 15 minutes before your new appointment time</li>
                    <li>Bring a valid ID and any relevant medical records</li>
                    <li>You can cancel or reschedule up to 2 hours before your appointment</li>
                    <li>If you need to make changes, log into your patient dashboard</li>
                  </ul>
                </div>
                
                <p>We look forward to seeing you at your rescheduled appointment!</p>
                
                <p>Best regards,<br>
                The Neurodent Clinic Team</p>
              </div>
              <div class="footer">
                <p>This email was sent to ${patientEmail}</p>
                <p>© 2025 Neurodent Clinic. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Dear ${patientName},
          
          Your appointment has been successfully rescheduled!
          
          PREVIOUS APPOINTMENT (CANCELLED):
          Date: ${formattedOldDate}
          Time: ${oldTimeRange}
          
          NEW APPOINTMENT (CONFIRMED):
          Date: ${formattedNewDate}
          Time: ${newTimeRange}
          
          COMPLETE APPOINTMENT DETAILS:
          Doctor: ${doctorName}
          Specialization: ${specialization}
          Date: ${formattedNewDate}
          Time: ${newTimeRange}
          Appointment Type: ${slotType}
          Location: Neurodent Clinic
          ${symptoms ? `Symptoms/Notes: ${symptoms}` : ''}
          
          IMPORTANT REMINDERS:
          - Please arrive 15 minutes before your new appointment time
          - Bring a valid ID and any relevant medical records
          - You can cancel or reschedule up to 2 hours before your appointment
          - If you need to make changes, log into your patient dashboard
          
          We look forward to seeing you at your rescheduled appointment!
          
          Best regards,
          The Neurodent Clinic Team
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      const isRealEmail = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'YOUR_GMAIL_ADDRESS@gmail.com';

      console.log('📧 Appointment reschedule notification sent to:', patientEmail);

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send appointment reschedule notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send Doctor Credentials Email
  async sendDoctorCredentialsEmail(email, doctorName, password) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const isRealEmail = process.env.EMAIL_USER && 
                         process.env.EMAIL_PASS && 
                         process.env.EMAIL_USER !== 'YOUR_SENDER_GMAIL@gmail.com' &&
                         process.env.EMAIL_PASS !== 'YOUR_16_CHARACTER_APP_PASSWORD';

      const mailOptions = {
        from: `"Neurodent System" <${process.env.EMAIL_USER || 'noreply@neurodent.com'}>`,
        to: email,
        subject: '🦷 Welcome to Neurodent - Your Doctor Account Credentials',
        html: this.generateDoctorCredentialsEmailTemplate(doctorName, email, password)
      };

      const info = await this.transporter.sendMail(mailOptions);

      if (!isRealEmail) {
        console.log('📧 Doctor credentials email sent to test account');
        console.log('🔗 Preview URL:', nodemailer.getTestMessageUrl(info));
        console.log('📋 Test Credentials - Email:', email, 'Password:', password);
      } else {
        console.log('📧 Doctor credentials email sent successfully to:', email);
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send doctor credentials email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send Pharmacist Credentials Email
  async sendPharmacistCredentialsEmail(email, pharmacistName, password) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const isRealEmail = process.env.EMAIL_USER && 
                         process.env.EMAIL_PASS && 
                         process.env.EMAIL_USER !== 'YOUR_SENDER_GMAIL@gmail.com' &&
                         process.env.EMAIL_PASS !== 'YOUR_16_CHARACTER_APP_PASSWORD';

      const mailOptions = {
        from: `"Neurodent System" <${process.env.EMAIL_USER || 'noreply@neurodent.com'}>`,
        to: email,
        subject: '💊 Welcome to Neurodent - Your Pharmacist Account Credentials',
        html: this.generatePharmacistCredentialsEmailTemplate(pharmacistName, email, password)
      };

      const info = await this.transporter.sendMail(mailOptions);

      if (!isRealEmail) {
        console.log('📧 Pharmacist credentials email sent to test account');
        console.log('🔗 Preview URL:', nodemailer.getTestMessageUrl(info));
        console.log('📋 Test Credentials - Email:', email, 'Password:', password);
      } else {
        console.log('📧 Pharmacist credentials email sent successfully to:', email);
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: !isRealEmail ? nodemailer.getTestMessageUrl(info) : null,
        isRealEmail: isRealEmail
      };

    } catch (error) {
      console.error('❌ Failed to send pharmacist credentials email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate Doctor Credentials Email Template
  generateDoctorCredentialsEmailTemplate(doctorName, email, password) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Doctor Account Created - Neurodent</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .credentials-box { background: #fff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .credential-row { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding: 10px; background: #f0f4ff; border-radius: 5px; }
          .credential-label { font-weight: bold; color: #667eea; }
          .credential-value { font-family: monospace; background: #333; color: #fff; padding: 5px 10px; border-radius: 3px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🦷 Neurodent</h1>
          <h2>Welcome to Our Team, Dr. ${doctorName}!</h2>
        </div>
        
        <div class="content">
          <p>Dear Dr. ${doctorName},</p>
          
          <p>Congratulations! Your doctor account has been successfully created in the Neurodent system. You can now access your dashboard using the credentials below:</p>
          
          <div class="credentials-box">
            <h3>🔐 Login Credentials</h3>
            <div class="credential-row">
              <span class="credential-label">Email:</span>
              <span class="credential-value">${email}</span>
            </div>
            <div class="credential-row">
              <span class="credential-label">Password:</span>
              <span class="credential-value">${password}</span>
            </div>
          </div>
          
          <div class="warning">
            <strong>⚠️ Important Security Notice:</strong>
            <ul>
              <li>Please change your password after your first login</li>
              <li>Do not share your login credentials with anyone</li>
              <li>Always log out when using shared computers</li>
              <li>Keep this email secure and delete it after changing your password</li>
            </ul>
          </div>
          
          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Visit the doctor login page</li>
            <li>Enter your email and the provided password</li>
            <li>Complete your profile information</li>
            <li>Change your password to something memorable</li>
            <li>Start managing your appointments and patients</li>
          </ol>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our admin team.</p>
          
          <p>Welcome aboard!</p>
          
          <p>Best regards,<br>
          <strong>Neurodent Administration Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This email contains sensitive information. Please handle it securely.</p>
          <p>&copy; 2024 Neurodent. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
  }

  // Generate Pharmacist Credentials Email Template
  generatePharmacistCredentialsEmailTemplate(pharmacistName, email, password) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pharmacist Account Created - Neurodent</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .credentials-box { background: #fff; border: 2px solid #28a745; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .credential-row { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding: 10px; background: #f0fff4; border-radius: 5px; }
          .credential-label { font-weight: bold; color: #28a745; }
          .credential-value { font-family: monospace; background: #333; color: #fff; padding: 5px 10px; border-radius: 3px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>💊 Neurodent</h1>
          <h2>Welcome to Our Team, ${pharmacistName}!</h2>
        </div>
        
        <div class="content">
          <p>Dear ${pharmacistName},</p>
          
          <p>Congratulations! Your pharmacist account has been successfully created in the Neurodent system. You can now access your pharmacy dashboard using the credentials below:</p>
          
          <div class="credentials-box">
            <h3>🔐 Login Credentials</h3>
            <div class="credential-row">
              <span class="credential-label">Email:</span>
              <span class="credential-value">${email}</span>
            </div>
            <div class="credential-row">
              <span class="credential-label">Password:</span>
              <span class="credential-value">${password}</span>
            </div>
          </div>
          
          <div class="warning">
            <strong>⚠️ Important Security Notice:</strong>
            <ul>
              <li>Please change your password after your first login</li>
              <li>Do not share your login credentials with anyone</li>
              <li>Always log out when using shared computers</li>
              <li>Keep this email secure and delete it after changing your password</li>
            </ul>
          </div>
          
          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Visit the pharmacist login page</li>
            <li>Enter your email and the provided password</li>
            <li>Complete your profile information</li>
            <li>Change your password to something memorable</li>
            <li>Start managing prescriptions and pharmacy operations</li>
          </ol>
          
          <p><strong>Your Responsibilities:</strong></p>
          <ul>
            <li>📋 Review and fulfill prescription orders</li>
            <li>💊 Manage medicine inventory</li>
            <li>📊 Track dispensed medications</li>
            <li>👥 Coordinate with doctors and patients</li>
          </ul>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our admin team.</p>
          
          <p>Welcome to the Neurodent family!</p>
          
          <p>Best regards,<br>
          <strong>Neurodent Administration Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This email contains sensitive information. Please handle it securely.</p>
          <p>&copy; 2024 Neurodent. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService();
