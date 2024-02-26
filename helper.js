const fs = require('fs');

function logToFile(filename, data) {
    const logMessage = `[${new Date().toISOString()}] ${data.message}\n`;
    fs.appendFile(filename, logMessage, (err) => {
        if (err) console.error("Error appending to log file:", err);
    });
}

module.exports = { logToFile };