async function increaseUsage(req) {
  if (!req.usage || !req.usageField) return;
  req.usage[req.usageField] += 1;
  await req.usage.save();
}
module.exports = increaseUsage;
