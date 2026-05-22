const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/darsh/Downloads/franks';

// 1. Update index.html
let indexContent = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
indexContent = indexContent.replace('<img src="src/profile.png" alt="User Profile" class="profile-img" loading="lazy">', '<img src="src/profile.png" alt="User Profile" class="profile-img">');
if (!indexContent.includes('rel="preload" as="image" href="src/profile.png"')) {
    indexContent = indexContent.replace('</head>', '    <link rel="preload" as="image" href="src/profile.png">\n</head>');
}
if (!indexContent.includes('rel="preconnect" href="https://fonts.googleapis.com"')) {
    indexContent = indexContent.replace('<head>', '<head>\n    <link rel="preconnect" href="https://fonts.googleapis.com">\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
}
fs.writeFileSync(path.join(dir, 'index.html'), indexContent);

// 2. Update porto.html
let portoContent = fs.readFileSync(path.join(dir, 'porto.html'), 'utf8');
// Remove Font Awesome
portoContent = portoContent.replace(/<link rel="stylesheet" href="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome\/6.4.0\/css\/all.min.css">\r?\n?/g, '');
// Add Preload for LCP (Me.png)
if (!portoContent.includes('rel="preload" as="image" href="src/Me.png"')) {
    portoContent = portoContent.replace('</head>', '    <link rel="preload" as="image" href="src/Me.png">\n</head>');
}
// Add loading="lazy" to all img except Me.png and those already having it
portoContent = portoContent.replace(/<img([^>]*)>/g, (match, p1) => {
    if (match.includes('src="src/Me.png"')) return match;
    if (match.includes('loading="lazy"')) return match;
    // ensure we don't duplicate attributes
    return `<img${p1} loading="lazy">`;
});

// Add defer to scripts if not present
if (!portoContent.includes('script.js" defer')) {
    portoContent = portoContent.replace('<script src="script.js"></script>', '<script src="script.js" defer></script>');
}
if (!portoContent.includes('porto.js" defer')) {
    portoContent = portoContent.replace('<script src="porto.js"></script>', '<script src="porto.js" defer></script>');
}
// DNS prefetching/preconnect for supabase
if (!portoContent.includes('rel="preconnect" href="https://slelguoygbfzlpylpxfs.supabase.co"')) {
    portoContent = portoContent.replace('<head>', '<head>\n    <link rel="preconnect" href="https://slelguoygbfzlpylpxfs.supabase.co" crossorigin>\n    <link rel="dns-prefetch" href="https://slelguoygbfzlpylpxfs.supabase.co">');
}

fs.writeFileSync(path.join(dir, 'porto.html'), portoContent);
console.log('Optimizations applied successfully');
