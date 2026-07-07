export default async function handler(req, res) {
  const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const hasCronSecret = !!process.env.CRON_SECRET;
  const cronMatch = req.headers["authorization"] === `Bearer ${process.env.CRON_SECRET}`;
  
  res.status(200).json({ 
    hasServiceAccount, 
    hasCronSecret,
    cronMatch,
    saLength: process.env.FIREBASE_SERVICE_ACCOUNT?.length || 0
  });
}
