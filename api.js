const {
  setup,
  getData
} = require("./scraper/methods.js");

(async () => {
  const {
    page,
  } = await setup();

  await getData(page, 'https://www.linkedin.com/in/gabrielmalinosqui');

})();
