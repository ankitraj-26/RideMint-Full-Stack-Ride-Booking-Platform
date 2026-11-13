const supportEmail = process.env.SUPPORT_EMAIL || 'support@ridego.com';
const supportPhone = process.env.SUPPORT_PHONE || '+91 98765 43210';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const defaultNotificationTemplate = ({ title, message, userName }) => `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#1c1c1c;">
      <div style="max-width:640px;margin:32px auto;padding:24px;background:#ffffff;border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
        <h2 style="margin:0 0 16px;color:#0b3b2e;">${escapeHtml(title)}</h2>
        <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Hi ${escapeHtml(userName || 'there')},</p>
        <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">${escapeHtml(message)}</p>
        <div style="background:#ecfdf5;padding:16px;border-radius:12px;border:1px solid #d1fae5;color:#065f46;">
          Need help? Contact ${escapeHtml(supportEmail)} or ${escapeHtml(supportPhone)}.
        </div>
      </div>
    </body>
  </html>
`;

export const getRideConfirmationTemplate = ({ riderName, rideId, pickup, destination, cabType, fare, status, bookingDate, supportEmailValue = supportEmail, supportPhoneValue = supportPhone }) => `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#1b1b1b;">
      <div style="max-width:640px;margin:32px auto;padding:28px;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="font-size:12px;letter-spacing:1.5px;color:#0f766e;text-transform:uppercase;font-weight:700;margin-bottom:12px;">RideGo booking confirmation</div>
        <h2 style="margin:0 0 16px;color:#0b3b2e;">Your ride has been successfully booked</h2>
        <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">Hi ${escapeHtml(riderName || 'Rider')},</p>
        <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Your ride request has been created successfully. We will notify you as soon as a driver is assigned.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;width:150px;">Ride ID</td><td style="padding:8px 0;color:#0f172a;">#${escapeHtml(rideId)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Booking time</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(bookingDate)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Pickup</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(pickup)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Destination</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(destination)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Vehicle</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(cabType)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Estimated fare</td><td style="padding:8px 0;color:#0f172a;">₹${Number(fare || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Status</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(status || 'Pending')}</td></tr>
        </table>
        <div style="background:#ecfdf5;border-radius:12px;padding:14px 16px;border:1px solid #d1fae5;color:#065f46;font-size:14px;line-height:1.6;">
          We are here to help. Reach us at ${escapeHtml(supportEmailValue)} or ${escapeHtml(supportPhoneValue)}.
        </div>
      </div>
    </body>
  </html>
`;

export const getRideStatusTemplate = ({ recipientName, rideId, title, message, statusLabel, supportEmailValue = supportEmail, supportPhoneValue = supportPhone }) => `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#1b1b1b;">
      <div style="max-width:640px;margin:32px auto;padding:28px;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="font-size:12px;letter-spacing:1.5px;color:#0f766e;text-transform:uppercase;font-weight:700;margin-bottom:12px;">Ride update</div>
        <h2 style="margin:0 0 16px;color:#0b3b2e;">${escapeHtml(title)}</h2>
        <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi ${escapeHtml(recipientName || 'Rider')},</p>
        <p style="font-size:16px;line-height:1.7;margin:0 0 20px;">${escapeHtml(message)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;width:120px;">Ride ID</td><td style="padding:8px 0;color:#0f172a;">#${escapeHtml(rideId)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Status</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(statusLabel)}</td></tr>
        </table>
        <div style="background:#eef2ff;border-radius:12px;padding:14px 16px;border:1px solid #c7d2fe;color:#312e81;font-size:14px;line-height:1.6;">
          Need assistance? Email ${escapeHtml(supportEmailValue)} or call ${escapeHtml(supportPhoneValue)}.
        </div>
      </div>
    </body>
  </html>
`;

export const getPaymentReceiptTemplate = ({ riderName, rideId, amount, method, transactionId, date, supportEmailValue = supportEmail, supportPhoneValue = supportPhone }) => `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#1b1b1b;">
      <div style="max-width:640px;margin:32px auto;padding:28px;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="font-size:12px;letter-spacing:1.5px;color:#0f766e;text-transform:uppercase;font-weight:700;margin-bottom:12px;">Payment receipt</div>
        <h2 style="margin:0 0 16px;color:#0b3b2e;">Payment confirmed</h2>
        <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">Hi ${escapeHtml(riderName || 'Rider')},</p>
        <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Your payment has been successfully processed for the ride below.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;width:150px;">Transaction ID</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(transactionId)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Ride ID</td><td style="padding:8px 0;color:#0f172a;">#${escapeHtml(rideId)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Amount</td><td style="padding:8px 0;color:#0f172a;">₹${Number(amount || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Method</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(method || 'UPI')}</td></tr>
          <tr><td style="padding:8px 0;color:#475569;font-weight:700;">Date</td><td style="padding:8px 0;color:#0f172a;">${escapeHtml(date)}</td></tr>
        </table>
        <div style="background:#ecfdf5;border-radius:12px;padding:14px 16px;border:1px solid #d1fae5;color:#065f46;font-size:14px;line-height:1.6;">
          This payment receipt can be downloaded from your account. Support: ${escapeHtml(supportEmailValue)} / ${escapeHtml(supportPhoneValue)}
        </div>
      </div>
    </body>
  </html>
`;

export const getVerificationStatusTemplate = ({ userName, status, reason, nextSteps, supportEmailValue = supportEmail, supportPhoneValue = supportPhone }) => `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#1b1b1b;">
      <div style="max-width:640px;margin:32px auto;padding:28px;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="font-size:12px;letter-spacing:1.5px;color:#0f766e;text-transform:uppercase;font-weight:700;margin-bottom:12px;">Driver verification</div>
        <h2 style="margin:0 0 16px;color:#0b3b2e;">Verification status: ${escapeHtml(status)}</h2>
        <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">Hi ${escapeHtml(userName || 'Driver')},</p>
        <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">${escapeHtml(reason || 'Your verification status has been updated.')}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;color:#334155;font-size:14px;line-height:1.7;">
          ${escapeHtml(nextSteps || 'Please contact support if you need assistance.')}
        </div>
        <p style="font-size:14px;line-height:1.7;margin:18px 0 0;">Support: ${escapeHtml(supportEmailValue)} / ${escapeHtml(supportPhoneValue)}</p>
      </div>
    </body>
  </html>
`;

export const getAdminAlertTemplate = ({ title, message, actorName, supportEmailValue = supportEmail, supportPhoneValue = supportPhone }) => `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#1b1b1b;">
      <div style="max-width:640px;margin:32px auto;padding:28px;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="font-size:12px;letter-spacing:1.5px;color:#0f766e;text-transform:uppercase;font-weight:700;margin-bottom:12px;">Admin alert</div>
        <h2 style="margin:0 0 16px;color:#0b3b2e;">${escapeHtml(title)}</h2>
        <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">${escapeHtml(message)}</p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;color:#9a4d00;font-size:14px;line-height:1.7;">
          Triggered by: ${escapeHtml(actorName || 'System')}
        </div>
        <p style="font-size:14px;line-height:1.7;margin:18px 0 0;">Support: ${escapeHtml(supportEmailValue)} / ${escapeHtml(supportPhoneValue)}</p>
      </div>
    </body>
  </html>
`;
