require("dotenv").config();
const puppeteer = require("puppeteer");
const {
  getDurationInDays,
  formatDate,
  getCleanText,
  getLocationFromText,
} = require("./utils");
const path = require("path");
const blockedResources = ["image", "stylesheet"];

const { getCookie } = require("./scraper/authentication");

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
  });

  const page = await browser.newPage();

  console.log("Adding helper methods to page");
  await page.exposeFunction("getCleanText", getCleanText);
  await page.exposeFunction("formatDate", formatDate);
  await page.exposeFunction("getDurationInDays", getDurationInDays);
  await page.exposeFunction("getLocationFromText", getLocationFromText);

  const cookie = await getCookie();

  await page.setCookie({
    name: "li_at",
    value: cookie,
    domain: ".www.linkedin.com",
  });

  await page.goto(
    "https://www.linkedin.com/in/wellington-cristi-vilela-santana-a48b1123/"
  );

  const expandButtonsSelectors = [
    ".pv-profile-section.pv-about-section .lt-line-clamp__more", // About
    "#experience-section .pv-profile-section__see-more-inline.link", // Experience
    ".pv-profile-section.education-section button.pv-profile-section__see-more-inline", // Education
    '.pv-skill-categories-section [data-control-name="skill_details"]', // Skills
  ];

  const seeMoreButtonsSelectors = [
    '.pv-entity__description .lt-line-clamp__line.lt-line-clamp__line--last .lt-line-clamp__more[href="#"]',
    '.lt-line-clamp__more[href="#"]:not(.lt-line-clamp__ellipsis--dummy)',
  ];

  console.log('Expanding all sections by clicking their "See more" buttons');

  for (const buttonSelector of expandButtonsSelectors) {
    if ((await page.$(buttonSelector)) !== null) {
      console.log(`Clicking button ${buttonSelector}`);
      await page.click(buttonSelector);
    }
  }

  // To give a little room to let data appear. Setting this to 0 might result in "Node is detached from document" errors
  await page.waitFor(100);

  for (const seeMoreButtonSelector of seeMoreButtonsSelectors) {
    const buttons = await page.$$(seeMoreButtonSelector);

    for (const button of buttons) {
      if (button) {
        await button.click();
      }
    }
  }

  const userProfile = await page.evaluate(async () => {
    const profileSection = document.querySelector(".pv-top-card");

    const url = window.location.href;

    const fullNameElement = profileSection.querySelector(
      ".pv-top-card--list li:first-child"
    );
    const fullName =
      fullNameElement && fullNameElement.textContent
        ? await window.getCleanText(fullNameElement.textContent)
        : null;

    const titleElement = profileSection.querySelector("h2");
    const title =
      titleElement && titleElement.textContent
        ? await window.getCleanText(titleElement.textContent)
        : null;

    const locationElement = profileSection.querySelector(
      ".pv-top-card--list.pv-top-card--list-bullet.mt1 li:first-child"
    );
    const locationText =
      locationElement && locationElement.textContent
        ? await window.getCleanText(locationElement.textContent)
        : null;
    const location = await getLocationFromText(locationText);

    const photoElement =
      profileSection.querySelector(".pv-top-card__photo") ||
      profileSection.querySelector(".profile-photo-edit__preview");
    const photo =
      photoElement && photoElement.getAttribute("src")
        ? photoElement.getAttribute("src")
        : null;

    const descriptionElement = document.querySelector(
      ".pv-about__summary-text .lt-line-clamp__raw-line"
    ); // Is outside "profileSection"
    const description =
      descriptionElement && descriptionElement.textContent
        ? await window.getCleanText(descriptionElement.textContent)
        : null;

    return {
      fullName,
      title,
      location,
      photo,
      description,
      url,
    };
  });

  const experiences = await page.$$eval(
    "#experience-section ul > .ember-view",
    async (nodes) => {
      let data = [];

      // Using a for loop so we can use await inside of it
      for (const node of nodes) {
        const titleElement = node.querySelector("h3");
        const title =
          titleElement && titleElement.textContent
            ? await window.getCleanText(titleElement.textContent)
            : null;

        const companyElement = node.querySelector(
          ".pv-entity__secondary-title"
        );
        const company =
          companyElement && companyElement.textContent
            ? await window.getCleanText(companyElement.textContent)
            : null;

        const descriptionElement = node.querySelector(
          ".pv-entity__description"
        );
        const description =
          descriptionElement && descriptionElement.textContent
            ? await window.getCleanText(descriptionElement.textContent)
            : null;

        const dateRangeElement = node.querySelector(
          ".pv-entity__date-range span:nth-child(2)"
        );
        const dateRangeText =
          dateRangeElement && dateRangeElement.textContent
            ? await window.getCleanText(dateRangeElement.textContent)
            : null;

        const startDatePart = dateRangeText
          ? await window.getCleanText(dateRangeText.split("–")[0])
          : null;
        const startDate = startDatePart ? startDatePart : null;

        const endDatePart = dateRangeText
          ? await window.getCleanText(dateRangeText.split("–")[1])
          : null;
        const endDateIsPresent = endDatePart
          ? endDatePart.trim().toLowerCase() === "o momento"
          : false;
        const endDate = endDatePart && !endDateIsPresent ? endDatePart : null;

        const durationInDaysWithEndDate =
          startDate && endDate && !endDateIsPresent
            ? await getDurationInDays(startDate, endDate)
            : null;
        const durationInDaysForPresentDate = endDateIsPresent
          ? await getDurationInDays(startDate, new Date())
          : null;
        const durationInDays = endDateIsPresent
          ? durationInDaysForPresentDate
          : durationInDaysWithEndDate;

        const locationElement = node.querySelector(
          ".pv-entity__location span:nth-child(2)"
        );
        const locationText =
          locationElement && locationElement.textContent
            ? await window.getCleanText(locationElement.textContent)
            : null;
        const location = await getLocationFromText(locationText);

        data.push({
          title,
          company,
          location,
          startDate,
          endDate,
          endDateIsPresent,
          durationInDays,
          description,
        });
      }

      return data;
    }
  );

  const education = await page.$$eval(
    "#education-section ul > .ember-view",
    async (nodes) => {
      // Note: the $$eval context is the browser context.
      // So custom methods you define in this file are not available within this $$eval.
      let data = [];
      for (const node of nodes) {
        const schoolNameElement = node.querySelector(
          "h3.pv-entity__school-name"
        );
        const schoolName =
          schoolNameElement && schoolNameElement.textContent
            ? await window.getCleanText(schoolNameElement.textContent)
            : null;

        const degreeNameElement = node.querySelector(
          ".pv-entity__degree-name .pv-entity__comma-item"
        );
        const degreeName =
          degreeNameElement && degreeNameElement.textContent
            ? await window.getCleanText(degreeNameElement.textContent)
            : null;

        const fieldOfStudyElement = node.querySelector(
          ".pv-entity__fos .pv-entity__comma-item"
        );
        const fieldOfStudy =
          fieldOfStudyElement && fieldOfStudyElement.textContent
            ? await window.getCleanText(fieldOfStudyElement.textContent)
            : null;

        const gradeElement = node.querySelector(
          ".pv-entity__grade .pv-entity__comma-item"
        );
        const grade =
          gradeElement && gradeElement.textContent
            ? await window.getCleanText(fieldOfStudyElement.textContent)
            : null;

        const dateRangeElement = node.querySelectorAll(
          ".pv-entity__dates time"
        );

        const startDatePart =
          dateRangeElement &&
          dateRangeElement[0] &&
          dateRangeElement[0].textContent
            ? await window.getCleanText(dateRangeElement[0].textContent)
            : null;
        const startDate = startDatePart
          ? await formatDate(startDatePart)
          : null;

        const endDatePart =
          dateRangeElement &&
          dateRangeElement[1] &&
          dateRangeElement[1].textContent
            ? await window.getCleanText(dateRangeElement[1].textContent)
            : null;
        const endDate = endDatePart ? await formatDate(endDatePart) : null;

        // const durationInDays = (startDate && endDate) ? await getDurationInDays(startDate, endDate) : null

        data.push({
          schoolName,
          degreeName,
          fieldOfStudy,
          startDate,
          endDate,
          // durationInDays
        });
      }

      return data;
    }
  );

  console.log(userProfile, experiences, education);
})();
