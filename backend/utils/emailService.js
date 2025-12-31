const nodemailer = require('nodemailer');

// Configure the transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can change this to your preferred provider
  auth: {
    user: 'sanikadhumal149@gmail.com', // REPLACE WITH YOUR EMAIL
    pass: 'kavg woqd ovdt srmz'     // REPLACE WITH YOUR APP PASSWORD (Not your login password)
  }
});

/**
 * Sends confirmation emails to both Buyer and Seller
 */
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  try {
    const itemTitle = negotiation.resourceId.title || "Resource";
    const totalCost = negotiation.totalValue;

    // --- BUYER EMAIL TEMPLATE ---
    const buyerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; max-width: 600px;">
        <h2 style="color: #0891b2;">OMNI CIRCULUS | Purchase Confirmation</h2>
        <p>Your agent has successfully negotiated a deal.</p>
        
        <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Item:</strong> ${itemTitle}</p>
          <p><strong>Total Payable:</strong> ₹${totalCost}</p>
          <p><strong>Location:</strong> ${negotiation.buyerLocation}</p>
        </div>

        <p>Please confirm this transaction to finalize the purchase.</p>
        
        <div style="margin-top: 25px;">
          <a href="${buyerLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">✅ CONFIRM PURCHASE</a>
          <a href="${buyerLink}&reject=true" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">❌ REJECT</a>
        </div>
      </div>
    `;

    // --- SELLER EMAIL TEMPLATE ---
    const sellerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; max-width: 600px;">
        <h2 style="color: #9333ea;">OMNI CIRCULUS | Sales Order</h2>
        <p>An agent has found a buyer for your resource.</p>
        
        <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Item:</strong> ${itemTitle}</p>
          <p><strong>Selling Price (Net):</strong> ₹${negotiation.finalPrice}</p>
        </div>

        <p>Please confirm stock release.</p>
        
        <div style="margin-top: 25px;">
          <a href="${sellerLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">✅ APPROVE SALE</a>
          <a href="${sellerLink}&reject=true" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">❌ REJECT</a>
        </div>
      </div>
    `;

    // Send Emails
    await transporter.sendMail({
      from: '"Omni Agent" <no-reply@omnicirculus.com>',
      to: negotiation.buyerEmail,
      subject: `Action Required: Confirm Purchase for ${itemTitle}`,
      html: buyerHtml
    });

    await transporter.sendMail({
      from: '"Omni Agent" <no-reply@omnicirculus.com>',
      to: negotiation.sellerEmail,
      subject: `Action Required: Approve Sale for ${itemTitle}`,
      html: sellerHtml
    });

    console.log(`📧 Emails sent to ${negotiation.buyerEmail} and ${negotiation.sellerEmail}`);
    return true;

  } catch (error) {
    console.error("Email Service Error:", error);
    return false;
  }
};

module.exports = { sendConfirmationEmails };

