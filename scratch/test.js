import { instagramGetUrl } from 'instagram-url-direct';
async function run() {
  const result = await instagramGetUrl('https://www.instagram.com/reel/DF9Q-sAN2B6/');
  console.log(result);
}
run();
