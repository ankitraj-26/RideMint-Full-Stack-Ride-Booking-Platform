import nodemailer from 'nodemailer';
import { getRideConfirmationTemplate, getRideStatusTemplate, getPaymentReceiptTemplate, getVerificationStatusTemplate, getAdminAlertTemplate, defaultNotificationTemplate } from './emailTemplates.js';

const toBoolean = (value) => value === true || value === 'true' || value === '1';

const normalizePhone = (value = '') => {
  if (!value || typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10 && !digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
};

const getEmailConfig = () => {
  const host = (process.env.EMAIL_HOST || '').trim();
  const port = Number(process.env.EMAIL_PORT || 587);
  const secure = toBoolean(process.env.EMAIL_SECURE) || port === 465;
  const user = (process.env.EMAIL_USER || process.env.EMAIL_USERNAME || '').trim();
  const pass = (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '').trim();
  const from = (process.env.EMAIL_FROM || '').trim();

  return { host, port, secure, user, pass, from };
};

export const validateEmailConfiguration = () => {
  const { host, user, pass, from } = getEmailConfig();

  if (!host) {
    return { ok: false, reason: 'EMAIL_HOST is missing. Set MAIL/SMTP host such as smtp.gmail.com.' };
  }

  if (!user) {
    return { ok: false, reason: 'EMAIL_USER is missing. Set the Gmail address used for outgoing mail.' };
  }

  if (!pass) {
    return { ok: false, reason: 'EMAIL_PASS is missing. For Gmail, use an App Password rather than the normal account password.' };
  }

  if (!from) {
    return { ok: false, reason: 'EMAIL_FROM is missing. Set the sender address, for example: "RideGo <you@gmail.com>".' };
  }

  return { ok: true, reason: 'Email configuration is present.' };
};

const isEmailConfigured = () => validateEmailConfiguration().ok;

const isSmsConfigured = () => {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (provider === 'twilio') {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
  }
  if (provider === 'msg91') {
    return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
  }
  return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
};

export const createEmailTransporter = () => {
  const validation = validateEmailConfiguration();
  if (!validation.ok) {
    return null;
  }

  const { host, port, secure, user, pass } = getEmailConfig();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
};

export const verifyEmailConnection = async () => {
  const transporter = createEmailTransporter();
  if (!transporter) {
    const validation = validateEmailConfiguration();
    return { ok: false, reason: validation.reason || 'Email provider not configured.' };
  }

  if (process.env.ENABLE_LIVE_EMAIL !== 'true') {
    return { ok: false, reason: 'Live SMTP verification is disabled. Set ENABLE_LIVE_EMAIL=true to allow real Gmail sends.' };
  }

  try {
    await transporter.verify();
    return { ok: true, message: 'Gmail SMTP connection verified successfully.' };
  } catch (error) {
    return {
      ok: false,
      reason: `SMTP verification failed: ${error?.message || 'Invalid SMTP credentials or network issue.'}`,
    };
  }
};

const buildNotificationHtml = ({ title, message, userName, notificationType, details }) => {
  switch (notificationType) {
    case 'ride_booking':
      return getRideConfirmationTemplate({
        riderName: userName,
        rideId: details.rideId || '#000',
        pickup: details.pickup || 'Pickup',
        destination: details.destination || 'Destination',
        cabType: details.cabType || 'Mini',
        fare: details.fare || 0,
        status: details.status || 'Pending',
        bookingDate: details.bookingDate || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });
    case 'ride_status':
      return getRideStatusTemplate({
        recipientName: userName,
        rideId: details.rideId || '#000',
        title,
        message,
        statusLabel: details.statusLabel || 'Updated',
      });
    case 'payment_receipt':
      return getPaymentReceiptTemplate({
        riderName: userName,
        rideId: details.rideId || '#000',
        amount: details.amount || 0,
        method: details.method || 'UPI',
        transactionId: details.transactionId || 'TXN000',
        date: details.date || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });
    case 'driver_verification':
      return getVerificationStatusTemplate({
        userName,
        status: details.status || 'Updated',
        reason: details.reason || message,
        nextSteps: details.nextSteps || 'Please contact support if you need help.',
      });
    case 'admin_alert':
      return getAdminAlertTemplate({
        title,
        message,
        actorName: details.actorName || 'System',
      });
    default:
      return defaultNotificationTemplate({ title, message, userName });
  }
};

export const sendEmailNotification = async ({ to, title, message, userName, notificationType, details }) => {
  const validation = validateEmailConfiguration();
  if (!to || !validation.ok) {
    return { ok: false, reason: validation.reason || 'Email provider not configured.' };
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    return { ok: false, reason: validation.reason || 'Email provider not configured.' };
  }

  if (process.env.ENABLE_LIVE_EMAIL !== 'true') {
    return { ok: false, reason: 'Live SMTP delivery is disabled. Set ENABLE_LIVE_EMAIL=true to allow real Gmail sends.' };
  }

  const subject = title || 'RideGo notification';
  const html = buildNotificationHtml({ title, message, userName, notificationType, details });

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'RideGo <noreply@ridego.local>',
      to,
      subject,
      html,
      text: message,
    });

    return { ok: true, provider: 'smtp', messageId: info?.messageId || null };
  } catch (error) {
    return { ok: false, reason: `SMTP delivery failed: ${error?.message || 'Invalid Gmail SMTP credentials or connection issue.'}` };
  }
};

export const sendSmsNotification = async ({ phone, message }) => {
  const sanitizedPhone = normalizePhone(phone);
  if (!sanitizedPhone || !isSmsConfigured()) {
    return { ok: false, reason: 'SMS provider not configured or phone is missing.' };
  }

  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();

  try {
    if (provider === 'twilio') {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const form = new URLSearchParams({ To: sanitizedPhone, From: from, Body: message });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      if (!response.ok) {
        const body = await response.text();
        return { ok: false, reason: body || 'Twilio delivery failed.' };
      }

      const payload = await response.json();
      return { ok: true, provider: 'twilio', sid: payload?.sid || null };
    }

    if (provider === 'msg91') {
      const authKey = process.env.SMS_API_KEY;
      const sender = process.env.SMS_SENDER_ID;
      const url = new URL('https://api.msg91.com/api/sendhttp.php');
      url.searchParams.set('authkey', authKey);
      url.searchParams.set('mobiles', sanitizedPhone.replace(/^\+/, ''));
      url.searchParams.set('message', message);
      url.searchParams.set('sender', sender);
      url.searchParams.set('route', '4');
      url.searchParams.set('country', '91');

      const response = await fetch(url.toString(), { method: 'GET' });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, reason: body || 'MSG91 delivery failed.' };
      }

      const body = await response.text();
      return { ok: true, provider: 'msg91', response: body };
    }

    return { ok: false, reason: 'Unsupported SMS provider. Configure SMS_PROVIDER=twilio or msg91.' };
  } catch (error) {
    return { ok: false, reason: error?.message || 'SMS delivery failed.' };
  }
};

export const sendWhatsAppNotification = async ({ phone, message }) => {
  const hasWhatsAppConfig = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER && process.env.WHATSAPP_PROVIDER);
  if (!hasWhatsAppConfig) {
    return { ok: false, reason: 'WhatsApp Business API not configured.' };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(phone).replace(/^\+/, ''),
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const data = await response.text();
      return { ok: false, reason: data || 'WhatsApp delivery failed.' };
    }

    const payload = await response.json();
    return { ok: true, provider: 'whatsapp', messageId: payload?.messages?.[0]?.id || null };
  } catch (error) {
    return { ok: false, reason: error?.message || 'WhatsApp delivery failed.' };
  }
};
