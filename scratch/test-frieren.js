import scraper from '@xct007/frieren-scraper';
async function run() {
  const res = await scraper.igdl('https://www.instagram.com/reel/DF9Q-sAN2B6/');
  console.log(res);
}
run();
