require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseGenMarkers } = require('./src/parser');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <!-- @gen: create a login form with email and password inputs and a submit button -->
</body>
</html>
`;

console.log('--- Parser test ---');
const markers = parseGenMarkers(htmlContent, 10);
console.log('Markers found:', markers.length);
if (markers.length > 0) {
  console.log('Prompt:', markers[0].prompt);
  console.log('Indent:', JSON.stringify(markers[0].indent));
  console.log('LineIndex:', markers[0].lineIndex);
}
