const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');

// Helper: builds the submissions URL for a problem code
function getProblemSubmissionUrl(problemCode) {
  return `https://www.codechef.com/problems/${problemCode}?tab=submissions`;
}

router.post('/codechef-accepted', async (req, res) => {
  const { cookies, problemCode } = req.body;
  if (!problemCode || !cookies || !Array.isArray(cookies)) {
    return res.status(400).json({ error: 'problemCode and cookies are required' });
  }

  const url = getProblemSubmissionUrl(problemCode);
  let browser;
  try {
    const browser = await puppeteer.launch({
  headless: true,
  executablePath: puppeteer.executablePath(), // <--- THIS IS IMPORTANT
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=375,812'
  ]
});
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
    await page.setCookie(...cookies);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for submissions container OR "no submissions" text (whichever appears first)
    const hasSubmissions = await page.$('div._my-submissions_1jl4n_157 div._data__container_1jl4n_188');
    if (!hasSubmissions) {
      return res.json({ accepted: false, hasSubmission: false });
    }

    const accepted = await page.evaluate(() => {
      const containers = document.querySelectorAll('div._my-submissions_1jl4n_157 div._data__container_1jl4n_188');
      for (let container of containers) {
        let found = Array.from(container.querySelectorAll('div._table__box_1jl4n_192')).some(box => {
          let key = box.querySelector('p._key_1jl4n_219')?.innerText.trim();
          let valueEl = box.querySelector('a._value_1jl4n_231, div._value_1jl4n_231, p._value_1jl4n_231');
          let value = valueEl?.innerText.trim();
          return key === "Result" && value === "Accepted";
        });
        if (found) return true;
      }
      return false;
    });

    res.json({ accepted, hasSubmission: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

router.get('/test', (req, res) => {
  res.send("working");
});

module.exports = router;