const nodemailer = require('nodemailer');
const config = require('../config/config');

let transporter = null;

const isSmtpConfigured = () =>
  Boolean(config.email.host && config.email.user && config.email.pass);

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass
      }
    });
  }

  return transporter;
};

/**
 * Send password-reset OTP email.
 * When SMTP is not configured, logs the OTP (dev/fallback) instead of failing hard
 * unless EMAIL_LOG_OTP is disabled.
 */
const sendPasswordResetOtpEmail = async ({ to, otp, role, expiresInMinutes }) => {
  const subject = 'NextKraft password reset OTP';
  const text = [
    `Your NextKraft ${role} password reset OTP is: ${otp}`,
    '',
    `This code expires in ${expiresInMinutes} minutes.`,
    'If you did not request this, ignore this email.'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin-bottom: 8px;">Password reset</h2>
      <p>Your NextKraft <strong>${role}</strong> password reset OTP is:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: bold; margin: 16px 0;">${otp}</p>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p style="color: #666;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  const mailer = getTransporter();
  if (!mailer) {
    if (config.email.logOtpWhenUnconfigured) {
      console.warn(
        `[EMAIL] SMTP not configured. Password reset OTP for ${to} (${role}): ${otp}`
      );
      return { delivered: false, mode: 'console' };
    }
    throw new Error('Email service is not configured');
  }

  await mailer.sendMail({
    from: config.email.from,
    to,
    subject,
    text,
    html
  });

  return { delivered: true, mode: 'smtp' };
};

module.exports = {
  sendPasswordResetOtpEmail,
  isSmtpConfigured
};
