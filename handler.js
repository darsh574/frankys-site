const { exec } = require('child_process');
const http = require('http');

// Registry of your profiles - mapping friendly names to Chrome profile directories
const profiles = {
    "shopify-main": "Profile 66",
    "shopify-client2": "Profile 5",
    "gmail-work": "Profile 12",
    "facebook-ads": "Profile 66"
};

const CHROME = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

// Read args from command line (protocol handler passes URL as argument)
const arg = process.argv[2];
if (arg) {
    handleUrl(arg);
}

function handleUrl(rawArg) {
    try {
        // Decode: myapp://open?url=https://shopify.com&profile=shopify-main
        const url = new URL(decodeURIComponent(rawArg));
        const targetUrl = url.searchParams.get('url');
        const profileKey = url.searchParams.get('profile');
        const profileDir = profiles[profileKey];

        if (!targetUrl || !profileDir) {
            console.error('Missing url or profile param');
            return;
        }

        const cmd = `${CHROME} --profile-directory="${profileDir}" "${targetUrl}"`;
        console.log('Running:', cmd);
        exec(cmd);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
