import https from 'https';
const url = 'https://www.instagram.com/reel/DF9Q-sAN2B6/';
const code = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)[1];
const options = {
  method: 'GET',
  hostname: 'instagram-social.p.rapidapi.com',
  path: `/api/v1/instagram/info?code=${code}`,
  headers: {
    'x-rapidapi-host': 'instagram-social.p.rapidapi.com',
    'x-rapidapi-key': 'd811aac32amsh78f4962a3135bccp1ee5f3jsn7b857a756101',
  },
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
req.on('error', console.error);
req.end();
