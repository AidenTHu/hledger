const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async () => {
  const pidFile = path.join(os.tmpdir(), 'hledger-web-e2e.pid');
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    if (pid) process.kill(pid);
    fs.unlinkSync(pidFile);
  } catch (e) { /* already gone */ }
  try {
    if (process.env.E2E_JOURNAL) fs.unlinkSync(process.env.E2E_JOURNAL);
  } catch (e) { /* already gone */ }
};
