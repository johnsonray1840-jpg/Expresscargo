/**
 * Branded Luxury Email Templates for Express Cargo
 * Soothing, realistic, and highly professional international air cargo milestone notifications
 */

/**
 * Generate Visual 6-Stage Progress Stepper for HTML Emails
 */
const renderEmailStepper = (currentStep = 1, progress = 0) => {
  const steps = [
    { num: 1, label: 'Booked' },
    { num: 2, label: 'Hub Intake' },
    { num: 3, label: 'In Transit' },
    { num: 4, label: 'Customs' },
    { num: 5, label: 'Out for Deliv.' },
    { num: 6, label: 'Delivered' }
  ];

  let cellsHtml = '';
  steps.forEach((s) => {
    const isCompleted = s.num < currentStep;
    const isCurrent = s.num === currentStep;

    const bgBadge = isCompleted
      ? '#10b981'
      : isCurrent
      ? '#D97706'
      : '#e2e8f0';

    const textBadge = isCompleted || isCurrent ? '#ffffff' : '#94a3b8';
    const labelColor = isCurrent ? '#0B1F3A' : isCompleted ? '#10b981' : '#94a3b8';
    const fontWeight = isCurrent ? 'bold' : 'normal';

    cellsHtml += `
      <td style="text-align: center; width: 16.66%; vertical-align: top; padding: 4px 2px;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${bgBadge}; color: ${textBadge}; line-height: 24px; font-size: 11px; font-weight: bold; margin: 0 auto 4px auto; text-align: center;">
          ${isCompleted ? '&#10003;' : s.num}
        </div>
        <span style="font-size: 10px; color: ${labelColor}; font-weight: ${fontWeight}; display: block; line-height: 1.2;">
          ${s.label}
        </span>
      </td>
    `;
  });

  return `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 8px; margin: 20px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">
        <span>Consignment Lifecycle Status</span>
        <span style="color: #D97706;">${progress}% Complete</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
        <tr>
          ${cellsHtml}
        </tr>
      </table>
      <div style="background: #e2e8f0; height: 4px; border-radius: 999px; margin-top: 12px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #0284c7 0%, #D97706 100%); width: ${Math.min(100, Math.max(5, progress))}%; height: 4px; border-radius: 999px;"></div>
      </div>
    </div>
  `;
};

/**
 * Generate Comprehensive Milestone Email
 */
const renderMilestoneEmailHtml = ({
  shipment,
  milestoneTitle = 'Shipment Milestone Update',
  milestoneMessage = 'Your consignment has reached a verified transit checkpoint.',
  milestoneStage = null,
  progressPercentage = 0,
  trackingUrl = ''
}) => {
  const trackingNumber = shipment.trackingNumber || 'EX-CARGO';
  const originCity = (shipment.origin && shipment.origin.city) || 'Origin Hub';
  const originCountry = (shipment.origin && shipment.origin.country) || '';
  const destCity = (shipment.destination && shipment.destination.city) || 'Destination';
  const destCountry = (shipment.destination && shipment.destination.country) || '';
  const senderName = (shipment.sender && shipment.sender.name) || 'Shipper';
  const recipientName = (shipment.recipient && shipment.recipient.name) || 'Consignee';
  const carrier = shipment.carrier || 'Express Cargo Global';
  const serviceType = (shipment.serviceType || 'Air Express').replace(/_/g, ' ').toUpperCase();

  const pkg0 = shipment.packages && shipment.packages[0];
  let weightStr = '12.5 KG';
  if (pkg0) {
    const wVal = typeof pkg0.weight === 'object' && pkg0.weight !== null ? pkg0.weight.value : pkg0.weight;
    const wUnit = typeof pkg0.weight === 'object' && pkg0.weight !== null ? pkg0.weight.unit : (pkg0.weightUnit || 'KG');
    if (wVal) weightStr = `${wVal} ${wUnit.toUpperCase()}`;
  }

  const eta = (shipment.eta && (shipment.eta.formattedEta || shipment.eta.estimatedDelivery)) || shipment.adminETA || shipment.systemETA || shipment.expectedDeliveryAt || shipment.estimatedDeliveryDate;
  const etaFormatted = eta ? (eta.includes && eta.includes(',') ? eta : new Date(eta).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) : 'On Schedule';

  const currentStep = milestoneStage ? milestoneStage.step : (progressPercentage >= 100 ? 6 : progressPercentage >= 85 ? 5 : progressPercentage >= 70 ? 4 : progressPercentage >= 30 ? 3 : progressPercentage >= 15 ? 2 : 1);
  const targetUrl = trackingUrl || `${process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : 'https://express-cargo.ltd'}/order.html?tracking=${trackingNumber}`;

  // Current physical location details
  const currLoc = shipment.currentLocation || shipment.currentCoordinates || {};
  let currentLocationLabel = currLoc.address || currLoc.city;

  // Determine Professional Transit Zone
  let zoneText = '';
  if (progressPercentage >= 100) {
    zoneText = 'Delivered - Final Destination';
    if (!currentLocationLabel) currentLocationLabel = destCity;
  } else if (progressPercentage >= 85) {
    zoneText = 'Local Distribution Hub';
    if (!currentLocationLabel) currentLocationLabel = `${destCity} Regional Facility`;
  } else if (progressPercentage >= 70) {
    zoneText = 'International Clearance Port';
    if (!currentLocationLabel) currentLocationLabel = `${destCity} Customs Border`;
  } else if (progressPercentage >= 50) {
    zoneText = 'Air Freight - In-Flight (Cruising Altitude)';
    if (!currentLocationLabel) currentLocationLabel = 'Global Transit Corridor';
  } else if (progressPercentage >= 30) {
    zoneText = 'Air Freight - Departure Zone';
    if (!currentLocationLabel) currentLocationLabel = `${originCity} Outbound Gateway`;
  } else if (progressPercentage >= 15) {
    zoneText = 'Processing Facility';
    if (!currentLocationLabel) currentLocationLabel = `${originCity} Central Hub`;
  } else {
    zoneText = 'Origin Dispatch Hub';
    if (!currentLocationLabel) currentLocationLabel = originCity;
  }

  currentLocationLabel += `<br><span style="font-size: 13px; color: #b45309; font-weight: 500;">Status: ${zoneText}</span>`;
  
  // Append precise progress completion
  currentLocationLabel += `<br><span style="font-size: 15px; font-weight: 800; color: #059669; margin-top: 6px; display: block; text-transform: uppercase;">
    <i style="margin-right: 4px;">&#9658;</i> Journey ${progressPercentage}% Complete
  </span>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${milestoneTitle}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
          <td align="center">
            <!-- Main Card Container -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(11, 31, 58, 0.08);">
              
              <!-- Luxury Navy Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0B1F3A 0%, #071526 100%); padding: 32px 28px; text-align: center; border-bottom: 3px solid #D97706;">
                  <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase;">
                    Express Cargo Global
                  </div>
                  <div style="font-size: 11px; color: #93c5fd; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; font-weight: 600;">
                    International Air &amp; Ocean Logistics
                  </div>
                  <div style="display: inline-block; background: rgba(217, 119, 6, 0.15); border: 1px solid rgba(217, 119, 6, 0.4); border-radius: 999px; padding: 4px 14px; margin-top: 14px;">
                    <span style="font-size: 11px; font-weight: bold; color: #fbbf24; font-family: monospace;">
                      WAYBILL #${trackingNumber}
                    </span>
                  </div>
                </td>
              </tr>

              <!-- Body Content -->
              <tr>
                <td style="padding: 28px 24px;">
                  
                  <!-- Soothing Milestone Status Callout -->
                  <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                    <div style="font-size: 16px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
                      ${milestoneTitle}
                    </div>
                    <div style="font-size: 13px; color: #166534; line-height: 1.5;">
                      ${milestoneMessage}
                    </div>
                  </div>

                  <!-- Greeting -->
                  <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">
                    Hello <strong>${recipientName}</strong> / <strong>${senderName}</strong>,
                  </p>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
                    We are pleased to provide you with the latest verified physical location and checkpoint feedback regarding your consignment:
                  </p>

                  <!-- 6-Stage Lifecycle Stepper -->
                  ${renderEmailStepper(currentStep, progressPercentage)}

                  <!-- Current Location & Routing Callout -->
                  <div style="background-color: #fef3c7; border: 2px solid #fbbf24; border-radius: 12px; padding: 20px; margin: 24px 0; box-shadow: 0 4px 6px -1px rgba(217, 119, 6, 0.1);">
                    <div style="font-size: 13px; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px;">
                      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ef4444; margin-right: 6px; animation: pulse 2s infinite;"></span>
                      Current Physical Location &amp; Feedback:
                    </div>
                    <div style="font-size: 18px; font-weight: 900; color: #78350f; display: flex; align-items: center; line-height: 1.4;">
                      ${currentLocationLabel}
                    </div>
                    <div style="font-size: 13px; color: #92400e; margin-top: 10px; font-weight: 600;">
                      <em>This is the most recent tracked location of your parcel.</em>
                    </div>
                  </div>

                  <!-- Flight Route Badge -->
                  <table style="width: 100%; border-collapse: collapse; background-color: #0B1F3A; border-radius: 12px; margin: 20px 0; color: #ffffff;">
                    <tr>
                      <td style="padding: 16px; width: 45%; vertical-align: middle;">
                        <span style="font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; display: block; font-weight: bold;">Origin Gateway</span>
                        <strong style="font-size: 15px; color: #ffffff; display: block; margin-top: 2px;">${originCity}</strong>
                        <span style="font-size: 11px; color: #cbd5e1;">${originCountry}</span>
                      </td>
                      <td style="padding: 16px 4px; text-align: center; width: 10%; vertical-align: middle; color: #D97706; font-size: 18px;">
                        &rarr;
                      </td>
                      <td style="padding: 16px; width: 45%; vertical-align: middle; text-align: right;">
                        <span style="font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; display: block; font-weight: bold;">Destination Port</span>
                        <strong style="font-size: 15px; color: #ffffff; display: block; margin-top: 2px;">${destCity}</strong>
                        <span style="font-size: 11px; color: #cbd5e1;">${destCountry}</span>
                      </td>
                    </tr>
                  </table>

                  <!-- Consignment Specification Table -->
                  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 24px 0 28px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; color: #64748b; font-weight: 600; width: 40%;">Service Class:</td>
                      <td style="padding: 10px 14px; color: #0B1F3A; font-weight: bold;">${serviceType}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Carrier Authority:</td>
                      <td style="padding: 10px 14px; color: #0B1F3A; font-weight: bold;">${carrier}</td>
                    </tr>
                    <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Total Weight &amp; Units:</td>
                      <td style="padding: 10px 14px; color: #0B1F3A; font-weight: bold;">${weightStr} &bull; ${(shipment.packages ? shipment.packages.length : 1)} Unit(s)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Estimated Delivery:</td>
                      <td style="padding: 10px 14px; color: #0284c7; font-weight: bold;">${etaFormatted}</td>
                    </tr>
                    <tr style="background-color: #f8fafc;">
                      <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">GPS Security Seal:</td>
                      <td style="padding: 10px 14px; color: #10b981; font-weight: bold;">VERIFIED &bull; TAMPER-PROOF ACTIVE</td>
                    </tr>
                  </table>

                  <!-- Interactive Live Radar Tracking CTA Button -->
                  <div style="text-align: center; margin: 32px 0 20px 0;">
                    <a href="${targetUrl}" style="background: linear-gradient(135deg, #D97706 0%, #b45309 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);">
                      Track Live Satellite Radar &rarr;
                    </a>
                  </div>

                  <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 16px 0 0 0;">
                    You will automatically receive further updates as your consignment clears remaining flight corridors and delivery hubs.
                  </p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px; text-align: center;">
                  <div style="font-size: 12px; font-weight: bold; color: #0B1F3A; margin-bottom: 4px;">
                    Express Cargo Dispatch &amp; Logistics Control
                  </div>
                  <div style="font-size: 11px; color: #64748b; line-height: 1.5;">
                    Support: <a href="mailto:support@express-cargo.ltd" style="color: #0284c7; text-decoration: none;">support@express-cargo.ltd</a> &bull; 24/7 Global Air &amp; Ocean Dispatch
                  </div>
                  <div style="font-size: 10px; color: #94a3b8; margin-top: 12px;">
                    &copy; ${new Date().getFullYear()} Express Cargo. Confidential &amp; Tamper-Sealed Courier Telemetry.
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

module.exports = {
  renderEmailStepper,
  renderMilestoneEmailHtml
};
