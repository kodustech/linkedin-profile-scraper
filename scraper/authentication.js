require("dotenv").config();
var fs = require("fs");

const statusLog = async (section, message, scraperSessionId) => {
  const sessionPart = scraperSessionId ? ` (${scraperSessionId})` : "";
  const messagePart = message ? `: ${message}` : null;
  return console.log(`Scraper (${section})${sessionPart}${messagePart}`);
};

const saveCookie = (cookie) => {
  return new Promise((resolve, reject) => {
    fs.writeFile("./.cookie", cookie, () => {
      resolve();
    });
  });
};

const getCookie = () => {
  return new Promise((resolve, reject) => {
    fs.readFile("./.cookie", "utf8", (err, data) => resolve(data));
  });
};

const checkIfLoggedIn = async (page) => {
  await page.goto("https://www.linkedin.com/in/barackobama/", {
    waitUntil: "networkidle2",
  });

  const logSection = "authentication";
  statusLog(logSection, "Check if we are still logged in...");

  const isLoggedIn = (await page.$('[name="email-or-phone"]')) === null;

  if (isLoggedIn) {
    statusLog(logSection, "All good. We are still logged in.");
    statusLog('Cookie', await getCookie())
  } else {
    statusLog(
      logSection,
      "Bad news. We are not logged in. Session is expired or our check to see if we are loggedin is not correct anymore."
    );
    /* await login(page);
    await checkIfLoggedIn(page); */
  }

  return isLoggedIn;
};

const login = async (page) => {
  statusLog('Login', "Logging in...");

  await page.goto("https://www.linkedin.com/login");
  await page.type("#username", process.env.EMAIL);
  await page.type("#password", process.env.PASSWORD);

  await page.click("[type=submit]");
  await page.waitForNavigation();
  const cookies = await page.cookies();
  const cookie = cookies.find((x) => x.name === "li_at").value;
  await saveCookie(cookie);

  statusLog('Login', "Save cookie"); 
};

module.exports = {
  saveCookie,
  getCookie,
  checkIfLoggedIn,
  login,
};
