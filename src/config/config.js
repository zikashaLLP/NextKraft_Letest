require('dotenv').config();

module.exports = {
  // Server configuration
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nextkraft',
    port: process.env.DB_PORT || 3306
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },
  
  // Firebase Cloud Messaging configuration
  fcm: {
    // Firebase Admin SDK service account key (JSON string or path to JSON file)
    // You can either:
    // 1. Set FCM_SERVICE_ACCOUNT_KEY as a JSON string in .env
    // 2. Set FCM_SERVICE_ACCOUNT_PATH as path to JSON file
    serviceAccountKey: process.env.FCM_SERVICE_ACCOUNT_KEY || null,
    serviceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH || null
  },

  // SMTP / email (forgot-password OTP)
  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'NextKraft <noreply@nextkraft.com>',
    // When SMTP is not configured, OTP is logged to the server console
    logOtpWhenUnconfigured: process.env.EMAIL_LOG_OTP !== 'false'
  },

  passwordReset: {
    otpTtlMinutes: parseInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || '10', 10),
    resendCooldownSeconds: parseInt(process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS || '60', 10)
  }
};

