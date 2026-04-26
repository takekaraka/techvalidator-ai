import https from 'https';

const url = 'https://www.instagram.com/reel/DF9Q-sAN2B6/';
const code = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)[1];

const options = {
  method: 'GET',
  hostname: 'instagram-scraper-api2.p.rapidapi.com',
  path: `/v1/post_info?code_or_id_or_url=${code}&include_insights=true`,
  headers: {
    'x-rapidapi-host': 'instagram-scraper-api2.p.rapidapi.com',
    'x-rapidapi-key': 'd811aac32amsh78f4962a3135bccp1ee5f3jsn7b857a756101',
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data.slice(0, 500)));
});
req.on('error', console.error);
req.end();
